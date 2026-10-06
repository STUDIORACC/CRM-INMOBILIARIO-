import type { SessionUser } from "@/lib/auth/session";
import { Filters, likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { VISIT_OUTCOMES, labelOf } from "@/lib/domain/constants";
import { APP_TZ, addDaysIso, fmtDateTime, fromInputDateTime, startOfDayIso, toInputDate } from "@/lib/domain/dates";
import { notifKey } from "@/lib/domain/events";
import { AppError, ForbiddenError } from "@/lib/errors";
import { nn } from "@/lib/validation/common";
import type { CompleteVisitInput, VisitInput, VisitListQuery } from "@/lib/validation/visits";
import { logSystemEvent, notify } from "./events";
import { recomputeLeadScores } from "./lead-score";
import { syncLeadStage } from "./opportunities";
import { createTask } from "./tasks";
import { orScope } from "./sql-helpers";

export interface VisitRow {
  id: string;
  scheduled_at: string;
  duration_min: number;
  status: string;
  outcome: string | null;
  advisor_id: string;
  advisor_notes: string | null;
  observations: string | null;
  cancel_reason: string | null;
  property_id: string;
  property_code: string;
  property_title: string;
  property_address: string | null;
  property_district: string;
  property_image: string | null;
  lead_id: string | null;
  client_id: string | null;
  opportunity_id: string | null;
  party_name: string;
  party_phone: string | null;
  rescheduled_from: string | null;
  past_due: boolean;
}

const COLUMNS = `v.id, v.scheduled_at, v.duration_min, v.status, v.outcome, v.advisor_id, v.advisor_notes, v.observations, v.cancel_reason,
  v.property_id, p.code as property_code, p.title as property_title, p.address as property_address, p.district as property_district,
  (select url from public.property_images pi where pi.property_id = p.id order by pi.is_cover desc, pi.position limit 1) as property_image,
  v.lead_id, v.client_id, v.opportunity_id, coalesce(l.full_name, c.full_name, 'Sin nombre') as party_name, coalesce(l.phone, c.phone) as party_phone,
  v.rescheduled_from, (v.status in ('scheduled', 'confirmed') and v.scheduled_at + (v.duration_min || ' minutes')::interval < now()) as past_due`;

const FROM = `from public.visits v
  join public.properties p on p.id = v.property_id
  left join public.leads l on l.id = v.lead_id
  left join public.clients c on c.id = v.client_id`;

const EOD = `(date_trunc('day', now() at time zone '${APP_TZ}') + interval '1 day') at time zone '${APP_TZ}'`;

export async function listVisits(db: Db, q: VisitListQuery, advisorScope?: string | null): Promise<{ rows: VisitRow[]; total: number }> {
  const f = new Filters();
  if (advisorScope) f.add("v.advisor_id = ?::uuid", advisorScope);
  if (q.advisor) f.add("v.advisor_id = ?::uuid", q.advisor);
  if (q.status) f.add("v.status = any(?::text[])", q.status.split(","));
  if (q.q) {
    const like = likePattern(q.q);
    f.add("(l.full_name ilike ? or c.full_name ilike ? or p.code ilike ? or p.title ilike ?)", like, like, like, like);
  }
  if (q.pending) f.raw("v.status in ('scheduled', 'confirmed') and v.scheduled_at + (v.duration_min || ' minutes')::interval < now()");
  else {
    switch (q.range) {
      case "today":
        f.raw(`v.scheduled_at >= ${EOD} - interval '1 day' and v.scheduled_at < ${EOD}`);
        break;
      case "tomorrow":
        f.raw(`v.scheduled_at >= ${EOD} and v.scheduled_at < ${EOD} + interval '1 day'`);
        break;
      case "week":
        f.raw(`v.scheduled_at >= ${EOD} - interval '1 day' and v.scheduled_at < ${EOD} + interval '6 days'`);
        break;
      case "upcoming":
        f.raw(`v.scheduled_at >= ${EOD} - interval '1 day'`);
        break;
      case "past":
        f.raw(`v.scheduled_at < ${EOD} - interval '1 day'`);
        break;
    }
  }
  const from = q.from ? startOfDayIso(q.from) : null;
  if (from) f.add("v.scheduled_at >= ?::timestamptz", from);
  const to = q.to ? startOfDayIso(q.to) : null;
  if (to) f.add("v.scheduled_at < ?::timestamptz", addDaysIso(to, 1));

  const total = await db.scalar<number>(`select count(*) ${FROM} ${f.where}`, f.params);
  const limit = f.param(q.pageSize);
  const offset = f.param((q.page - 1) * q.pageSize);
  const order = q.range === "past" || q.status === "completed" ? "desc" : "asc";
  const rows = await db.query<VisitRow>(`select ${COLUMNS} ${FROM} ${f.where} order by v.scheduled_at ${order} limit ${limit} offset ${offset}`, f.params);
  return { rows, total: Number(total ?? 0) };
}

export async function exportVisits(db: Db, q: VisitListQuery): Promise<VisitRow[]> {
  const { rows } = await listVisits(db, { ...q, page: 1, pageSize: 100 });
  return rows;
}

export async function getVisit(db: Db, id: string): Promise<VisitRow | null> {
  return db.one<VisitRow>(`select ${COLUMNS} ${FROM} where v.id = $1`, [id]);
}

export async function visitsForRecord(db: Db, scope: { leadId?: string | null; clientId?: string | null; opportunityId?: string | null; propertyId?: string | null; leadIds?: string[] }): Promise<VisitRow[]> {
  const sc = orScope();
  sc.eq("v.lead_id", scope.leadId);
  sc.any("v.lead_id", scope.leadIds);
  sc.eq("v.client_id", scope.clientId);
  sc.eq("v.opportunity_id", scope.opportunityId);
  sc.eq("v.property_id", scope.propertyId);
  const { params, conds } = sc;
  if (!conds.length) return [];
  return db.query<VisitRow>(`select ${COLUMNS} ${FROM} where ${conds.join(" or ")} order by v.scheduled_at desc limit 100`, params);
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------
async function advanceOpportunity(db: Db, session: SessionUser, oppId: string | null, target: "visit_scheduled" | "visit_done") {
  if (!oppId) return;
  const order = ["new", "contacted", "qualified", "interested", "visit_scheduled", "visit_done", "negotiation", "reserved"];
  const row = await db.one<{ stage: string; lead_id: string | null; client_id: string | null; property_id: string }>("select stage, lead_id, client_id, property_id from public.opportunities where id = $1", [oppId]);
  if (!row) return;
  const cur = order.indexOf(row.stage);
  if (cur < 0 || cur >= order.indexOf(target)) return;
  const st = await db.one<{ label: string; default_probability: number }>("select label, default_probability from public.pipeline_stages where key = $1", [target]);
  const from = await db.scalar<string>("select label from public.pipeline_stages where key = $1", [row.stage]);
  await db.query("update public.opportunities set stage = $2, probability = $3 where id = $1", [oppId, target, st?.default_probability ?? 50]);
  await logSystemEvent(db, { event: "opportunity_stage", userId: session.id, leadId: row.lead_id, clientId: row.client_id, opportunityId: oppId, propertyId: row.property_id, meta: { from, to: st?.label } });
  await syncLeadStage(db, session, row.lead_id);
}

export interface VisitConflict {
  id: string;
  scheduled_at: string;
  duration_min: number;
  property_code: string;
  party_name: string;
}

export async function findVisitConflicts(db: Db, advisorId: string, startIso: string, durationMin: number, excludeId?: string | null): Promise<VisitConflict[]> {
  return db.query<VisitConflict>(
    `select v.id, v.scheduled_at, v.duration_min, p.code as property_code, coalesce(l.full_name, c.full_name, 'Cliente') as party_name
       from public.visits v join public.properties p on p.id = v.property_id
       left join public.leads l on l.id = v.lead_id left join public.clients c on c.id = v.client_id
      where v.advisor_id = $1 and v.status in ('scheduled', 'confirmed') and ($4::uuid is null or v.id <> $4)
        and v.scheduled_at < ($2::timestamptz + ($3 || ' minutes')::interval)
        and (v.scheduled_at + (v.duration_min || ' minutes')::interval) > $2::timestamptz`,
    [advisorId, startIso, String(durationMin), excludeId ?? null],
  );
}

export async function createVisit(db: Db, session: SessionUser, input: VisitInput): Promise<{ id: string }> {
  const startIso = fromInputDateTime(input.scheduledAt);
  if (!startIso) throw new AppError("La fecha y hora no son válidas.", { scheduledAt: ["Fecha inválida"] });
  const leadId = nn(input.leadId);
  const clientId = nn(input.clientId);
  const opportunityId = nn(input.opportunityId);

  const prop = await db.one<{ id: string; code: string; title: string; status: string }>("select id, code, title, status from public.properties where id = $1", [input.propertyId]);
  if (!prop) throw new AppError("No se encontró la propiedad.");
  if (["sold", "rented", "withdrawn"].includes(prop.status)) throw new AppError(`La propiedad ${prop.code} ya no está disponible para visitas.`, { propertyId: ["No disponible"] });
  if (session.role === "advisor" && input.advisorId !== session.id) throw new ForbiddenError("Solo gerencia o asistentes pueden agendar visitas para otros asesores.");

  if (!input.force) {
    const conflicts = await findVisitConflicts(db, input.advisorId, startIso, input.durationMin, nn(input.rescheduleOf));
    if (conflicts.length) {
      throw new AppError(`El asesor ya tiene una visita a esa hora (${conflicts[0].property_code} con ${conflicts[0].party_name}, ${fmtDateTime(conflicts[0].scheduled_at)}).`, undefined, "conflict", conflicts);
    }
  }

  const row = await db.one<{ id: string }>(
    `insert into public.visits (property_id, lead_id, client_id, opportunity_id, advisor_id, scheduled_at, duration_min, observations, rescheduled_from, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [input.propertyId, leadId, clientId, opportunityId, input.advisorId, startIso, input.durationMin, nn(input.observations), nn(input.rescheduleOf), session.id],
  );
  const id = row!.id;

  await logSystemEvent(db, { event: nn(input.rescheduleOf) ? "visit_rescheduled" : "visit_scheduled", userId: session.id, leadId, clientId, opportunityId, propertyId: input.propertyId, visitId: id, meta: { code: prop.code }, body: `Para el ${fmtDateTime(startIso)}` });
  await advanceOpportunity(db, session, opportunityId, "visit_scheduled");
  if (leadId) {
    await db.query("update public.leads set stage = 'visit' where id = $1 and stage in ('new', 'contacted', 'qualified', 'opportunity')", [leadId]);
    await db.query("update public.property_matches set status = 'visit_scheduled' where lead_id = $1 and property_id = $2", [leadId, input.propertyId]);
    await recomputeLeadScores(db, [leadId]);
  }
  if (clientId) await db.query("update public.property_matches set status = 'visit_scheduled' where client_id = $1 and property_id = $2", [clientId, input.propertyId]);

  const party = leadId ? await db.scalar<string>("select full_name from public.leads where id = $1", [leadId]) : await db.scalar<string>("select full_name from public.clients where id = $1", [clientId]);
  await notify(db, { userId: input.advisorId, actorId: session.id, type: "visit_upcoming", title: `Visita agendada: ${prop.code} · ${party}`, body: fmtDateTime(startIso), href: "/visits", entityType: "visit", entityId: id, dedupeKey: notifKey.visitSoon(id) });
  return { id };
}

export async function confirmVisit(db: Db, session: SessionUser, id: string): Promise<void> {
  const v = await db.one<{ lead_id: string | null; client_id: string | null; opportunity_id: string | null; property_id: string; code: string }>(
    `update public.visits v set status = 'confirmed' from public.properties p
      where v.id = $1 and p.id = v.property_id and v.status = 'scheduled'
      returning v.lead_id, v.client_id, v.opportunity_id, v.property_id, p.code`,
    [id],
  );
  if (!v) throw new AppError("La visita no se puede confirmar (ya fue confirmada, cerrada o no tienes permiso).");
  await logSystemEvent(db, { event: "visit_confirmed", userId: session.id, leadId: v.lead_id, clientId: v.client_id, opportunityId: v.opportunity_id, propertyId: v.property_id, visitId: id, meta: { code: v.code } });
}

export async function completeVisit(db: Db, session: SessionUser, input: CompleteVisitInput): Promise<{ id: string }> {
  const v = await db.one<{ lead_id: string | null; client_id: string | null; opportunity_id: string | null; property_id: string; code: string; advisor_id: string }>(
    `update public.visits v set status = 'completed', outcome = $2, advisor_notes = $3, completed_at = now() from public.properties p
      where v.id = $1 and p.id = v.property_id and v.status in ('scheduled', 'confirmed')
      returning v.lead_id, v.client_id, v.opportunity_id, v.property_id, p.code, v.advisor_id`,
    [input.id, input.outcome, input.notes],
  );
  if (!v) throw new AppError("La visita ya fue cerrada o no tienes permiso para registrar su resultado.");
  const outcomeLabel = labelOf(VISIT_OUTCOMES, input.outcome);
  await logSystemEvent(db, { event: "visit_completed", userId: session.id, leadId: v.lead_id, clientId: v.client_id, opportunityId: v.opportunity_id, propertyId: v.property_id, visitId: input.id, meta: { code: v.code, outcome: outcomeLabel }, body: `Resultado: ${outcomeLabel}` });
  await db.query(
    `insert into public.activities (type, title, body, lead_id, client_id, opportunity_id, property_id, visit_id, user_id)
     values ('visit', $1, $2, $3, $4, $5, $6, $7, $8)`,
    [`Visita a ${v.code} · ${outcomeLabel}`, input.notes, v.lead_id, v.client_id, v.opportunity_id, v.property_id, input.id, session.id],
  );
  await advanceOpportunity(db, session, v.opportunity_id, "visit_done");
  if (v.lead_id) {
    await db.query("update public.leads set stage = 'visit' where id = $1 and stage in ('new', 'contacted', 'qualified', 'opportunity')", [v.lead_id]);
    await recomputeLeadScores(db, [v.lead_id]);
  }
  if (input.followUp !== false) {
    const due = input.followUpAt && fromInputDateTime(input.followUpAt) ? input.followUpAt : null;
    const party = v.lead_id ? await db.scalar<string>("select full_name from public.leads where id = $1", [v.lead_id]) : await db.scalar<string>("select full_name from public.clients where id = $1", [v.client_id]);
    const tomorrow = toInputDate(addDaysIso(new Date().toISOString(), 1));
    await createTask(db, session, {
      title: `Seguimiento post visita con ${party}`,
      kind: "follow_up",
      assignedTo: v.advisor_id,
      priority: input.outcome === "very_interested" || input.outcome === "interested" ? "high" : "medium",
      dueAt: due ?? `${tomorrow}T10:00`,
      leadId: v.lead_id ?? "",
      clientId: v.client_id ?? "",
      opportunityId: v.opportunity_id ?? "",
      propertyId: v.property_id,
      description: `Resultado de la visita: ${outcomeLabel}`,
    });
  }
  return { id: input.id };
}

export async function cancelVisit(db: Db, session: SessionUser, id: string, mode: "cancelled" | "no_show", reason: string | null): Promise<void> {
  const v = await db.one<{ lead_id: string | null; client_id: string | null; opportunity_id: string | null; property_id: string; code: string; advisor_id: string }>(
    `update public.visits v set status = $2, cancel_reason = $3 from public.properties p
      where v.id = $1 and p.id = v.property_id and v.status in ('scheduled', 'confirmed')
      returning v.lead_id, v.client_id, v.opportunity_id, v.property_id, p.code, v.advisor_id`,
    [id, mode, reason],
  );
  if (!v) throw new AppError("La visita ya fue cerrada o no tienes permiso para modificarla.");
  await logSystemEvent(db, { event: mode === "no_show" ? "visit_no_show" : "visit_cancelled", userId: session.id, leadId: v.lead_id, clientId: v.client_id, opportunityId: v.opportunity_id, propertyId: v.property_id, visitId: id, meta: { code: v.code }, body: reason });
  await notify(db, { userId: v.advisor_id, actorId: session.id, type: "visit_cancelled", title: `${mode === "no_show" ? "Cliente no asistió" : "Visita cancelada"}: ${v.code}`, body: reason, href: "/visits", entityType: "visit", entityId: id, dedupeKey: notifKey.visitCancelled(id) });
  if (v.lead_id) await recomputeLeadScores(db, [v.lead_id]);
}

export async function rescheduleVisit(db: Db, session: SessionUser, oldId: string, input: VisitInput): Promise<{ id: string }> {
  const old = await db.one<{ status: string }>("select status from public.visits where id = $1", [oldId]);
  if (!old) throw new AppError("No se encontró la visita original.");
  if (!["scheduled", "confirmed"].includes(old.status)) throw new AppError("Solo se pueden reprogramar visitas pendientes.");
  const created = await createVisit(db, session, { ...input, rescheduleOf: oldId });
  await db.query("update public.visits set status = 'rescheduled' where id = $1", [oldId]);
  return created;
}

export async function deleteVisit(db: Db, id: string): Promise<void> {
  await db.query("update public.visits set rescheduled_from = null where rescheduled_from = $1", [id]);
  const res = await db.query("delete from public.visits where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No tienes permiso para eliminar esta visita.");
}

/** Contadores para los chips de la agenda de visitas. */
export async function visitChipCounts(db: Db): Promise<{ pending: number; tomorrowUnconfirmed: number; today: number }> {
  const r = await db.one<{ pending: number; tomorrow: number; today: number }>(
    `select count(*) filter (where status in ('scheduled', 'confirmed') and scheduled_at + (duration_min || ' minutes')::interval < now())::int as pending,
            count(*) filter (where status = 'scheduled' and scheduled_at >= ${EOD} and scheduled_at < ${EOD} + interval '1 day')::int as tomorrow,
            count(*) filter (where status in ('scheduled', 'confirmed') and scheduled_at >= ${EOD} - interval '1 day' and scheduled_at < ${EOD})::int as today
       from public.visits`,
  );
  return { pending: r?.pending ?? 0, tomorrowUnconfirmed: r?.tomorrow ?? 0, today: r?.today ?? 0 };
}
