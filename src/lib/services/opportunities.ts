import type { SessionUser } from "@/lib/auth/session";
import { Filters, likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { LEAD_STAGES, labelOf, type Currency } from "@/lib/domain/constants";
import { notifKey } from "@/lib/domain/events";
import { formatMoney } from "@/lib/domain/money";
import { AppError, ForbiddenError } from "@/lib/errors";
import { can } from "@/lib/domain/permissions";
import { nn } from "@/lib/validation/common";
import type { OpportunityInput, OpportunityListQuery } from "@/lib/validation/opportunities";
import { loadThresholds } from "./alerts";
import { logSystemEvent, notify, notifyManagers } from "./events";
import { convertLeadToClient, markLeadLost } from "./leads";
import { recomputeLeadScores } from "./lead-score";
import { orScope } from "./sql-helpers";

export interface OpportunityRow {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  party_name: string;
  property_id: string;
  property_code: string;
  property_title: string;
  property_district: string;
  property_status: string;
  property_image: string | null;
  assigned_to: string;
  stage: string;
  value: number;
  currency: Currency;
  probability: number;
  priority: string;
  operation: string;
  expected_close_date: string | null;
  next_step: string | null;
  next_activity_at: string | null;
  next_activity_title: string | null;
  stage_changed_at: string;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  lost_notes: string | null;
  days_idle: number;
}

const COLUMNS = `o.id, o.lead_id, o.client_id, coalesce(l.full_name, c.full_name, 'Sin nombre') as party_name,
  o.property_id, p.code as property_code, p.title as property_title, p.district as property_district, p.status as property_status,
  (select url from public.property_images pi where pi.property_id = p.id order by pi.is_cover desc, pi.position limit 1) as property_image,
  o.assigned_to, o.stage, o.value, o.currency, o.probability, o.priority, o.operation, o.expected_close_date::text as expected_close_date,
  o.next_step, o.next_activity_at, o.next_activity_title, o.stage_changed_at, o.last_activity_at, o.created_at, o.updated_at, o.won_at, o.lost_at,
  o.lost_reason, o.lost_notes,
  floor(extract(epoch from (now() - coalesce(o.last_activity_at, o.created_at))) / 86400)::int as days_idle`;

const FROM = `from public.opportunities o
  join public.properties p on p.id = o.property_id
  join public.pipeline_stages s on s.key = o.stage
  left join public.leads l on l.id = o.lead_id
  left join public.clients c on c.id = o.client_id`;

const SORTS: Record<OpportunityListQuery["sort"], string> = {
  updated_at: "o.updated_at",
  value: "o.value",
  expected_close_date: "o.expected_close_date",
  stage_changed_at: "o.stage_changed_at",
  probability: "o.probability",
};

async function filtersFor(db: Db, q: OpportunityListQuery, includeClosed: boolean): Promise<Filters> {
  const f = new Filters();
  if (q.q) {
    const like = likePattern(q.q);
    f.add("(l.full_name ilike ? or c.full_name ilike ? or p.code ilike ? or p.title ilike ?)", like, like, like, like);
  }
  if (q.stage) f.add("o.stage = ?", q.stage);
  if (q.advisor) f.add("o.assigned_to = ?::uuid", q.advisor);
  if (q.priority) f.add("o.priority = ?", q.priority);
  if (q.operation) f.add("o.operation = ?", q.operation);
  if (q.stalled) {
    const t = await loadThresholds(db);
    f.raw(`s.kind = 'open' and coalesce(o.last_activity_at, o.created_at) < now() - interval '${Math.max(1, Math.trunc(t.oppDays))} days'`);
  }
  if (!includeClosed) f.raw("s.kind = 'open'");
  else if (q.closed === "none") f.raw("s.kind = 'open'");
  else f.raw("(s.kind = 'open' or coalesce(o.won_at, o.lost_at) > now() - interval '90 days')");
  return f;
}

/** Tablero (todas las abiertas + cerradas de los últimos 90 días). */
export async function listBoard(db: Db, q: OpportunityListQuery): Promise<OpportunityRow[]> {
  const f = await filtersFor(db, q, true);
  return db.query<OpportunityRow>(`select ${COLUMNS} ${FROM} ${f.where} order by o.updated_at desc limit 600`, f.params);
}

export async function listOpportunities(db: Db, q: OpportunityListQuery): Promise<{ rows: OpportunityRow[]; total: number }> {
  const f = await filtersFor(db, q, true);
  const total = await db.scalar<number>(`select count(*) ${FROM} ${f.where}`, f.params);
  const limit = f.param(q.pageSize);
  const offset = f.param((q.page - 1) * q.pageSize);
  const rows = await db.query<OpportunityRow>(
    `select ${COLUMNS} ${FROM} ${f.where} order by ${SORTS[q.sort]} ${q.dir === "asc" ? "asc" : "desc"} nulls last limit ${limit} offset ${offset}`,
    f.params,
  );
  return { rows, total: Number(total ?? 0) };
}

export async function exportOpportunities(db: Db, q: OpportunityListQuery): Promise<OpportunityRow[]> {
  const f = await filtersFor(db, q, true);
  return db.query<OpportunityRow>(`select ${COLUMNS} ${FROM} ${f.where} order by o.updated_at desc limit 20000`, f.params);
}

export async function getOpportunity(db: Db, id: string): Promise<(OpportunityRow & { lead_stage: string | null; lead_phone: string | null; lead_email: string | null; client_phone: string | null; client_email: string | null; property_price: number; property_currency: Currency; created_by: string | null; stage_kind: string }) | null> {
  return db.one(
    `select ${COLUMNS}, l.stage as lead_stage, l.phone as lead_phone, l.email as lead_email, c.phone as client_phone, c.email as client_email,
            p.price as property_price, p.currency as property_currency, o.created_by, s.kind as stage_kind
       ${FROM} where o.id = $1`,
    [id],
  );
}

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------
const RANK: Record<string, number> = { new: 0, contacted: 1, qualified: 2, opportunity: 3, visit: 4, negotiation: 5, won: 6, lost: -1 };
const LEAD_STAGE_FOR_OPP: Record<string, string | null> = {
  new: null,
  contacted: null,
  qualified: "qualified",
  interested: "opportunity",
  visit_scheduled: "visit",
  visit_done: "visit",
  negotiation: "negotiation",
  reserved: "negotiation",
  won: "won",
};

/** Mantiene la etapa del lead alineada con su oportunidad más avanzada (nunca retrocede sola). */
export async function syncLeadStage(db: Db, session: SessionUser, leadId: string | null): Promise<void> {
  if (!leadId) return;
  const lead = await db.one<{ stage: string }>("select stage from public.leads where id = $1", [leadId]);
  if (!lead || lead.stage === "lost") return;
  const opps = await db.query<{ stage: string }>("select stage from public.opportunities where lead_id = $1 and stage <> 'lost'", [leadId]);
  let target: string | null = null;
  for (const o of opps) {
    const t = LEAD_STAGE_FOR_OPP[o.stage];
    if (t && (target === null || RANK[t] > RANK[target])) target = t;
  }
  if (target && RANK[target] > RANK[lead.stage]) {
    await db.query("update public.leads set stage = $2 where id = $1", [leadId, target]);
    await logSystemEvent(db, { event: "stage_changed", userId: session.id, leadId, meta: { from: labelOf(LEAD_STAGES, lead.stage), to: labelOf(LEAD_STAGES, target) } });
  }
  await recomputeLeadScores(db, [leadId]);
}

async function stageInfo(db: Db, key: string) {
  const s = await db.one<{ key: string; label: string; kind: "open" | "won" | "lost"; default_probability: number }>("select key, label, kind, default_probability from public.pipeline_stages where key = $1", [key]);
  if (!s) throw new AppError("La etapa seleccionada no existe.");
  return s;
}

export async function createOpportunity(db: Db, session: SessionUser, input: OpportunityInput): Promise<{ id: string }> {
  const leadId = nn(input.leadId);
  const clientId = nn(input.clientId);
  const stage = await stageInfo(db, input.stage);
  if (stage.kind !== "open") throw new AppError("Una oportunidad nueva debe iniciar en una etapa abierta.");

  const prop = await db.one<{ id: string; code: string; title: string; status: string; operation: string }>("select id, code, title, status, operation from public.properties where id = $1", [input.propertyId]);
  if (!prop) throw new AppError("No se encontró la propiedad seleccionada.");
  if (["sold", "rented", "withdrawn"].includes(prop.status)) throw new AppError(`La propiedad ${prop.code} no está disponible (${prop.status === "sold" ? "vendida" : prop.status === "rented" ? "alquilada" : "retirada"}).`, { propertyId: ["No disponible"] });

  if (session.role === "advisor" && input.assignedTo !== session.id) throw new ForbiddenError("Solo gerencia puede crear oportunidades para otros vendedores.");

  // Una oportunidad por lead/propiedad abierta: evita duplicar el mismo negocio
  const dup = await db.scalar<string>(
    `select o.id from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open'
      where o.property_id = $1 and (($2::uuid is not null and o.lead_id = $2) or ($3::uuid is not null and o.client_id = $3)) limit 1`,
    [input.propertyId, leadId, clientId],
  );
  if (dup) throw new AppError("Ya existe una oportunidad abierta para esta persona y propiedad.", { propertyId: ["Oportunidad duplicada"] });

  const row = await db.one<{ id: string }>(
    `insert into public.opportunities (lead_id, client_id, property_id, assigned_to, stage, value, currency, probability, priority, operation, expected_close_date, next_step, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
    [leadId, clientId, input.propertyId, input.assignedTo, input.stage, input.value, input.currency, input.probability, input.priority, prop.operation, nn(input.expectedCloseDate), nn(input.nextStep), session.id],
  );
  const id = row!.id;
  if (leadId) await db.query("update public.leads set property_id = coalesce(property_id, $2) where id = $1", [leadId, input.propertyId]);

  await logSystemEvent(db, { event: "opportunity_created", userId: session.id, leadId, clientId, opportunityId: id, propertyId: input.propertyId, meta: { code: prop.code }, body: `Valor estimado: ${formatMoney(input.value, input.currency)} · Probabilidad ${input.probability}%` });
  await syncLeadStage(db, session, leadId);

  const party = leadId
    ? await db.scalar<string>("select full_name from public.leads where id = $1", [leadId])
    : await db.scalar<string>("select full_name from public.clients where id = $1", [clientId]);
  await notify(db, { userId: input.assignedTo, actorId: session.id, type: "opportunity_new", title: `Nueva oportunidad: ${party} · ${prop.code}`, body: formatMoney(input.value, input.currency), href: `/opportunities/${id}`, entityType: "opportunity", entityId: id, dedupeKey: notifKey.oppNew(id) });
  await notifyManagers(db, { actorId: session.id, type: "opportunity_new", title: `Nueva oportunidad: ${party} · ${prop.code}`, body: formatMoney(input.value, input.currency), href: `/opportunities/${id}`, entityType: "opportunity", entityId: id, dedupeKey: notifKey.oppNew(id) });
  return { id };
}

export async function updateOpportunity(
  db: Db,
  session: SessionUser,
  input: { id: string; value: number | null; probability: number; priority: string; expectedCloseDate?: string; nextStep?: string; assignedTo?: string },
): Promise<void> {
  const cur = await db.one<{ assigned_to: string }>("select assigned_to from public.opportunities where id = $1", [input.id]);
  if (!cur) throw new AppError("No se encontró la oportunidad o no tienes acceso a ella.");
  const assignedTo = nn(input.assignedTo) ?? cur.assigned_to;
  if (assignedTo !== cur.assigned_to && !can(session.role, "opportunities.reassign")) throw new ForbiddenError("Solo gerencia puede reasignar oportunidades.");
  const res = await db.one<{ id: string }>(
    `update public.opportunities set value = $2, probability = $3, priority = $4, expected_close_date = $5, next_step = $6, assigned_to = $7
      where id = $1 and stage not in ('won', 'lost') returning id`,
    [input.id, input.value, input.probability, input.priority, nn(input.expectedCloseDate), nn(input.nextStep), assignedTo],
  );
  if (!res) throw new AppError("No se pudo actualizar: la oportunidad está cerrada o no tienes permiso.");
}

export async function moveOpportunity(db: Db, session: SessionUser, id: string, stageKey: string): Promise<{ stage: string }> {
  const target = await stageInfo(db, stageKey);
  if (target.kind === "lost") throw new AppError("Para cerrar como perdida registra el motivo de pérdida.", undefined, "needs_lost_reason");
  if (target.kind === "won") throw new AppError("Para cerrar como ganada confirma el valor final de la operación.", undefined, "needs_won_confirmation");

  const cur = await db.one<{ stage: string; lead_id: string | null; client_id: string | null; property_id: string; kind: string; assigned_to: string; value: number; currency: Currency }>(
    `select o.stage, o.lead_id, o.client_id, o.property_id, s.kind, o.assigned_to, o.value, o.currency
       from public.opportunities o join public.pipeline_stages s on s.key = o.stage where o.id = $1`,
    [id],
  );
  if (!cur) throw new AppError("No se encontró la oportunidad o no tienes acceso a ella.");
  if (cur.stage === stageKey) return { stage: stageKey };

  const res = await db.one<{ id: string }>("update public.opportunities set stage = $2, probability = $3 where id = $1 returning id", [id, stageKey, target.default_probability]);
  if (!res) throw new AppError("No tienes permiso para mover esta oportunidad.");

  const [fromS, prop] = await Promise.all([
    stageInfo(db, cur.stage),
    db.one<{ code: string; title: string }>("select code, title from public.properties where id = $1", [cur.property_id]),
  ]);
  const ev = stageKey === "negotiation" ? "negotiation_started" : stageKey === "reserved" ? "reserved" : "opportunity_stage";
  await logSystemEvent(db, { event: ev, userId: session.id, leadId: cur.lead_id, clientId: cur.client_id, opportunityId: id, propertyId: cur.property_id, meta: { from: fromS.label, to: target.label, code: prop?.code } });

  if (stageKey === "reserved") {
    const msg = { actorId: session.id, type: "property_reserved", title: `${prop?.code} cambió a reservado`, body: prop?.title, href: `/properties/${cur.property_id}`, entityType: "property", entityId: cur.property_id, dedupeKey: notifKey.propertyReserved(cur.property_id, id) };
    await notify(db, { ...msg, userId: cur.assigned_to });
    await notifyManagers(db, msg);
  }
  await syncLeadStage(db, session, cur.lead_id);
  return { stage: stageKey };
}

export async function winOpportunity(db: Db, session: SessionUser, id: string, value: number, notes: string | null): Promise<{ clientId: string | null }> {
  const cur = await db.one<{ stage: string; lead_id: string | null; client_id: string | null; property_id: string; kind: string; currency: Currency; assigned_to: string }>(
    `select o.stage, o.lead_id, o.client_id, o.property_id, s.kind, o.currency, o.assigned_to
       from public.opportunities o join public.pipeline_stages s on s.key = o.stage where o.id = $1`,
    [id],
  );
  if (!cur) throw new AppError("No se encontró la oportunidad o no tienes acceso a ella.");
  if (cur.kind === "won") throw new AppError("La oportunidad ya está cerrada como ganada.");
  const res = await db.one<{ id: string }>("update public.opportunities set stage = 'won', value = $2, next_step = null where id = $1 returning id", [id, value]);
  if (!res) throw new AppError("No tienes permiso para cerrar esta oportunidad.");

  const prop = await db.one<{ code: string; operation: string }>("select code, operation from public.properties where id = $1", [cur.property_id]);
  let clientId = cur.client_id;
  if (cur.lead_id) {
    await db.query("update public.leads set stage = 'won' where id = $1 and stage <> 'won'", [cur.lead_id]);
    const conv = await convertLeadToClient(db, session, cur.lead_id);
    clientId = conv.clientId;
    await db.query("update public.opportunities set client_id = $2 where id = $1 and client_id is null", [id, clientId]);
    await recomputeLeadScores(db, [cur.lead_id]);
  }
  // La reserva/otras oportunidades abiertas sobre la misma propiedad pierden vigencia
  const others = await db.query<{ id: string; lead_id: string | null }>(
    `update public.opportunities set stage = 'lost', lost_reason = 'other_property', lost_notes = 'La propiedad se cerró con otro cliente.'
      where property_id = $1 and id <> $2 and stage in (select key from public.pipeline_stages where kind = 'open') returning id, lead_id`,
    [cur.property_id, id],
  );
  for (const o of others) await logSystemEvent(db, { event: "lost", userId: session.id, leadId: o.lead_id, opportunityId: o.id, propertyId: cur.property_id, meta: { reason: "La propiedad se cerró con otro cliente" } });

  await logSystemEvent(db, { event: "won", userId: session.id, leadId: cur.lead_id, clientId, opportunityId: id, propertyId: cur.property_id, meta: { value: formatMoney(value, cur.currency), code: prop?.code }, body: notes });
  const msg = { actorId: session.id, type: "opportunity_new", title: `¡Cierre ganado! ${prop?.code} · ${formatMoney(value, cur.currency)}`, href: `/opportunities/${id}`, entityType: "opportunity", entityId: id, dedupeKey: `opp_won:${id}` };
  await notifyManagers(db, msg);
  return { clientId };
}

export async function loseOpportunity(
  db: Db,
  session: SessionUser,
  id: string,
  reason: string,
  notes: string | null,
  alsoLead: boolean,
  lossLabel: (k: string) => string,
): Promise<void> {
  const cur = await db.one<{ lead_id: string | null; client_id: string | null; property_id: string; kind: string }>(
    "select o.lead_id, o.client_id, o.property_id, s.kind from public.opportunities o join public.pipeline_stages s on s.key = o.stage where o.id = $1",
    [id],
  );
  if (!cur) throw new AppError("No se encontró la oportunidad o no tienes acceso a ella.");
  if (cur.kind !== "open") throw new AppError("Solo se pueden cerrar como perdidas las oportunidades abiertas.");
  const res = await db.one<{ id: string }>("update public.opportunities set stage = 'lost', lost_reason = $2, lost_notes = $3, next_step = null where id = $1 returning id", [id, reason, notes]);
  if (!res) throw new AppError("No tienes permiso para cerrar esta oportunidad.");
  await logSystemEvent(db, { event: "lost", userId: session.id, leadId: cur.lead_id, clientId: cur.client_id, opportunityId: id, propertyId: cur.property_id, meta: { reason: lossLabel(reason) }, body: notes });
  await db.query("update public.tasks set status = 'cancelled' where opportunity_id = $1 and status in ('pending', 'in_progress')", [id]);
  await db.query("update public.visits set status = 'cancelled', cancel_reason = 'Oportunidad cerrada como perdida' where opportunity_id = $1 and status in ('scheduled', 'confirmed')", [id]);

  if (cur.lead_id) {
    if (alsoLead) {
      const stillOpen = await db.scalar<number>("select count(*) from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open' where o.lead_id = $1", [cur.lead_id]);
      if (Number(stillOpen) === 0) await markLeadLost(db, session, cur.lead_id, reason, notes, lossLabel);
    } else {
      // El cliente sigue buscando: el lead vuelve al pool de calificados si no tiene otra oportunidad abierta
      const stillOpen = await db.scalar<number>("select count(*) from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open' where o.lead_id = $1", [cur.lead_id]);
      if (Number(stillOpen) === 0) await db.query("update public.leads set stage = 'qualified' where id = $1 and stage in ('opportunity', 'visit', 'negotiation')", [cur.lead_id]);
    }
    await recomputeLeadScores(db, [cur.lead_id]);
  }
}

export async function deleteOpportunity(db: Db, id: string): Promise<void> {
  await db.query("update public.visits set opportunity_id = null where opportunity_id = $1", [id]);
  const res = await db.query("delete from public.opportunities where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No tienes permiso para eliminar esta oportunidad.");
}

/** Oportunidades asociadas a un lead / cliente / propiedad. */
export async function opportunitiesForRecord(db: Db, scope: { leadId?: string | null; clientId?: string | null; propertyId?: string | null; leadIds?: string[] }): Promise<OpportunityRow[]> {
  const sc = orScope();
  sc.eq("o.lead_id", scope.leadId);
  sc.any("o.lead_id", scope.leadIds);
  sc.eq("o.client_id", scope.clientId);
  sc.eq("o.property_id", scope.propertyId);
  const { params, conds } = sc;
  if (!conds.length) return [];
  return db.query<OpportunityRow>(`select ${COLUMNS} ${FROM} where ${conds.join(" or ")} order by (s.kind = 'open') desc, o.updated_at desc limit 50`, params);
}
