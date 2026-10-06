import type { SessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import type { Db } from "@/lib/db/types";
import { LEAD_STAGES, labelOf } from "@/lib/domain/constants";
import { fromInputDateTime } from "@/lib/domain/dates";
import { nn } from "@/lib/validation/common";
import type { ActivityInput } from "@/lib/validation/leads";
import { logSystemEvent } from "./events";
import { recomputeLeadScores } from "./lead-score";
import { createTask } from "./tasks";

const DEFAULT_TITLES: Record<string, string> = {
  call: "Llamada",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Reunión",
  follow_up: "Seguimiento",
  note: "Nota agregada",
};

/**
 * Registra una actividad manual (llamada, WhatsApp, email, reunión, seguimiento, nota).
 * Efectos: actualiza última actividad / primer contacto (triggers), avanza el lead de
 * "Nuevo" a "Contactado" tras el primer contacto saliente, recalcula el score y puede
 * programar el siguiente seguimiento.
 */
export async function logActivity(db: Db, session: SessionUser, input: ActivityInput): Promise<{ id: string }> {
  const leadId = nn(input.leadId);
  const clientId = nn(input.clientId);
  const opportunityId = nn(input.opportunityId);
  const propertyId = nn(input.propertyId);
  const ownerId = nn(input.ownerId);
  const title = (input.title ?? "").trim() || DEFAULT_TITLES[input.type];
  const body = (input.body ?? "").trim() || null;

  let noteId: string | null = null;
  if (input.type === "note") {
    const note = await db.one<{ id: string }>(
      `insert into public.notes (body, author_id, lead_id, client_id, opportunity_id, property_id, owner_id)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [body, session.id, leadId, clientId, opportunityId, propertyId, ownerId],
    );
    noteId = note!.id;
  }

  const contact = ["call", "whatsapp", "email"].includes(input.type);
  const row = await db.one<{ id: string }>(
    `insert into public.activities (type, title, body, direction, responded, lead_id, client_id, opportunity_id, property_id, owner_id, note_id, user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [input.type, title, noteId ? null : body, input.direction, contact ? (input.responded ?? false) : null, leadId, clientId, opportunityId, propertyId, ownerId, noteId, session.id],
  );
  if (!row) throw new AppError("No se pudo registrar la actividad.");

  if (leadId) {
    // Primer contacto saliente: Nuevo -> Contactado
    if (contact && input.direction === "outbound") {
      const moved = await db.one<{ id: string }>("update public.leads set stage = 'contacted' where id = $1 and stage = 'new' returning id", [leadId]);
      if (moved) {
        await logSystemEvent(db, { event: "stage_changed", userId: session.id, leadId, meta: { from: labelOf(LEAD_STAGES, "new"), to: labelOf(LEAD_STAGES, "contacted") } });
      }
    }
    await recomputeLeadScores(db, [leadId]);
  }

  if (input.followUpAt) {
    const due = fromInputDateTime(input.followUpAt);
    if (due) {
      const assignee = leadId
        ? ((await db.scalar<string>("select assigned_to from public.leads where id = $1", [leadId])) ?? session.id)
        : session.id;
      await createTask(db, session, {
        title: `Seguimiento: ${title}`,
        kind: "follow_up",
        assignedTo: assignee,
        priority: "medium",
        dueAt: input.followUpAt,
        leadId: leadId ?? "",
        clientId: clientId ?? "",
        opportunityId: opportunityId ?? "",
        propertyId: propertyId ?? "",
        description: "",
      });
    }
  }
  return { id: row.id };
}

export async function updateNote(db: Db, id: string, body: string): Promise<void> {
  const res = await db.query("update public.notes set body = $2 where id = $1 returning id", [id, body.trim()]);
  if (res.length === 0) throw new AppError("No tienes permiso para editar esta nota.");
}

export async function setNotePinned(db: Db, id: string, pinned: boolean): Promise<void> {
  const res = await db.query("update public.notes set pinned = $2 where id = $1 returning id", [id, pinned]);
  if (res.length === 0) throw new AppError("No tienes permiso para modificar esta nota.");
}

export async function deleteNote(db: Db, id: string): Promise<void> {
  await db.query("delete from public.activities where note_id = $1", [id]);
  const res = await db.query("delete from public.notes where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No tienes permiso para eliminar esta nota.");
}
