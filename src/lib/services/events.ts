import type { Db } from "@/lib/db/types";
import { json } from "@/lib/db/types";
import { eventTitle, type EventMeta, type SystemEvent } from "@/lib/domain/events";

export interface SystemEventInput {
  event: SystemEvent;
  userId: string | null;
  leadId?: string | null;
  clientId?: string | null;
  opportunityId?: string | null;
  propertyId?: string | null;
  ownerId?: string | null;
  visitId?: string | null;
  meta?: EventMeta;
  body?: string | null;
  metadata?: Record<string, unknown>;
  at?: Date;
}

/** Registra un evento de sistema en la línea de tiempo (actividad type='system'). */
export async function logSystemEvent(db: Db, e: SystemEventInput): Promise<void> {
  await db.query(
    `insert into public.activities (type, event, title, body, lead_id, client_id, opportunity_id, property_id, owner_id, visit_id, user_id, metadata, occurred_at)
     values ('system', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12::timestamptz, now()))`,
    [
      e.event,
      eventTitle(e.event, e.meta),
      e.body ?? null,
      e.leadId ?? null,
      e.clientId ?? null,
      e.opportunityId ?? null,
      e.propertyId ?? null,
      e.ownerId ?? null,
      e.visitId ?? null,
      e.userId,
      json(e.metadata ?? {}),
      e.at ?? null,
    ],
  );
}

const SETTING_FOR_TYPE: Record<string, string> = {
  lead_assigned: "new_lead_assigned",
  follow_up_overdue: "follow_up_overdue",
  visit_upcoming: "visit_upcoming",
  visit_cancelled: "visit_cancelled",
  opportunity_stalled: "opportunity_stalled",
  task_overdue: "task_overdue",
  property_reserved: "property_reserved",
  client_new: "new_client",
  opportunity_new: "new_opportunity",
};

export interface NotifyInput {
  userId: string | null | undefined;
  actorId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
}

/** Crea una notificación respetando la configuración de la empresa; no notifica al propio actor. */
export async function notify(db: Db, n: NotifyInput): Promise<void> {
  if (!n.userId || n.userId === n.actorId) return;
  const key = SETTING_FOR_TYPE[n.type];
  if (key) {
    const enabled = await db.scalar<boolean>("select coalesce((notify_settings ->> $1)::boolean, true) from public.company_settings where id = 1", [key]);
    if (enabled === false) return;
  }
  // Función SECURITY DEFINER: un usuario no puede insertar avisos para otros bajo RLS (ver migración 0006)
  await db.query(
    "select public.push_notification($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8)",
    [n.userId, n.type, n.title, n.body ?? null, n.href ?? null, n.entityType ?? null, n.entityId ?? null, n.dedupeKey ?? null],
  );
}

/** Notifica a administradores y gerentes activos (excepto al actor). */
export async function notifyManagers(db: Db, n: Omit<NotifyInput, "userId">): Promise<void> {
  const managers = await db.query<{ id: string }>("select id from public.users where status = 'active' and role in ('admin', 'manager')");
  for (const m of managers) await notify(db, { ...n, userId: m.id, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${m.id}` : undefined });
}
