import type { SessionUser } from "@/lib/auth/session";
import { Filters, likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { LEAD_STAGES, labelOf, type Currency } from "@/lib/domain/constants";
import { addDaysIso, startOfDayIso } from "@/lib/domain/dates";
import { normalizePhone } from "@/lib/domain/phone";
import { AppError, ForbiddenError } from "@/lib/errors";
import { can } from "@/lib/domain/permissions";
import { nn } from "@/lib/validation/common";
import type { LeadInput, LeadListQuery } from "@/lib/validation/leads";
import { leadAlertSql, loadThresholds } from "./alerts";
import { logSystemEvent, notify, notifyManagers } from "./events";
import { recomputeLeadScores } from "./lead-score";
import { notifKey } from "@/lib/domain/events";

// ---------------------------------------------------------------------------
// Consulta de listado
// ---------------------------------------------------------------------------
export interface TagRef {
  id: string;
  name: string;
  color: string;
}

export interface LeadListRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  stage: string;
  priority: string;
  score: number;
  temperature: string;
  assigned_to: string | null;
  property_id: string | null;
  property_code: string | null;
  property_title: string | null;
  last_activity_at: string | null;
  next_follow_up_at: string | null;
  next_follow_up_title: string | null;
  created_at: string;
  client_id: string | null;
  operation_type: string | null;
  property_type: string | null;
  districts: string[];
  budget_min: number | null;
  budget_max: number | null;
  currency: Currency;
  interest_level: string | null;
  lost_reason: string | null;
  tags: TagRef[];
}

const digits = (s: string) => s.replace(/\D/g, "");

const SORTS: Record<LeadListQuery["sort"], string> = {
  created_at: "l.created_at",
  full_name: "lower(l.full_name)",
  score: "l.score",
  last_activity_at: "l.last_activity_at",
  next_follow_up_at: "l.next_follow_up_at",
  priority: "case l.priority when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end",
  stage: "case l.stage when 'new' then 1 when 'contacted' then 2 when 'qualified' then 3 when 'opportunity' then 4 when 'visit' then 5 when 'negotiation' then 6 when 'won' then 7 else 8 end",
};

export function leadFilters(q: LeadListQuery, thresholds: Awaited<ReturnType<typeof loadThresholds>>): Filters {
  const f = new Filters();
  if (q.q) {
    const like = likePattern(q.q);
    const d = digits(q.q);
    if (d.length >= 3) f.add("(l.full_name ilike ? or l.email ilike ? or p.code ilike ? or l.phone_normalized like ?)", like, like, like, `%${d}%`);
    else f.add("(l.full_name ilike ? or l.email ilike ? or p.code ilike ?)", like, like, like);
  }
  if (q.stage.length) f.add("l.stage = any(?::text[])", q.stage);
  if (q.priority.length) f.add("l.priority = any(?::text[])", q.priority);
  if (q.source.length) f.add("l.source = any(?::text[])", q.source);
  if (q.temp.length) f.add("l.temperature = any(?::text[])", q.temp);
  if (q.tag.length) f.add("exists (select 1 from public.lead_tags lt where lt.lead_id = l.id and lt.tag_id = any(?::uuid[]))", q.tag);
  if (q.assigned === "none") f.raw("l.assigned_to is null");
  else if (q.assigned) f.add("l.assigned_to = ?::uuid", q.assigned);
  if (q.district) f.add("? = any(l.districts)", q.district);
  if (q.operation) f.add("l.operation_type = ?", q.operation);
  if (q.type) f.add("l.property_type = ?", q.type);
  const from = q.from ? startOfDayIso(q.from) : null;
  if (from) f.add("l.created_at >= ?::timestamptz", from);
  const to = q.to ? startOfDayIso(q.to) : null;
  if (to) f.add("l.created_at < ?::timestamptz", addDaysIso(to, 1));
  if (q.alert) f.raw(leadAlertSql(q.alert, thresholds));
  return f;
}

const LIST_FROM = `from public.leads l left join public.properties p on p.id = l.property_id`;

const LIST_COLUMNS = `l.id, l.full_name, l.avatar_url, l.phone, l.email, l.source, l.stage, l.priority, l.score, l.temperature, l.assigned_to,
  l.property_id, p.code as property_code, p.title as property_title, l.last_activity_at, l.next_follow_up_at, l.next_follow_up_title,
  l.created_at, l.client_id, l.operation_type, l.property_type, l.districts, l.budget_min, l.budget_max, l.currency, l.interest_level, l.lost_reason,
  (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name), '[]'::json)
     from public.lead_tags lt join public.tags t on t.id = lt.tag_id where lt.lead_id = l.id) as tags`;

export async function listLeads(db: Db, q: LeadListQuery): Promise<{ rows: LeadListRow[]; total: number }> {
  const thresholds = await loadThresholds(db);
  const f = leadFilters(q, thresholds);
  const total = await db.scalar<number>(`select count(*) ${LIST_FROM} ${f.where}`, f.params);
  const limit = f.param(q.pageSize);
  const offset = f.param((q.page - 1) * q.pageSize);
  const dir = q.dir === "asc" ? "asc" : "desc";
  const rows = await db.query<LeadListRow>(
    `select ${LIST_COLUMNS} ${LIST_FROM} ${f.where} order by ${SORTS[q.sort]} ${dir} nulls last, l.created_at desc limit ${limit} offset ${offset}`,
    f.params,
  );
  return { rows, total: Number(total ?? 0) };
}

/** Todas las filas que cumplen el filtro (exportación). */
export async function exportLeads(db: Db, q: LeadListQuery, max = 20000): Promise<LeadListRow[]> {
  const thresholds = await loadThresholds(db);
  const f = leadFilters(q, thresholds);
  const dir = q.dir === "asc" ? "asc" : "desc";
  return db.query<LeadListRow>(`select ${LIST_COLUMNS} ${LIST_FROM} ${f.where} order by ${SORTS[q.sort]} ${dir} nulls last limit ${max}`, f.params);
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------
export interface LeadDetail {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  stage: string;
  priority: string;
  score: number;
  temperature: string;
  assigned_to: string | null;
  assigned_at: string | null;
  property_id: string | null;
  message: string | null;
  operation_type: string | null;
  property_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: Currency;
  districts: string[];
  bedrooms_min: number | null;
  bathrooms_min: number | null;
  area_min: number | null;
  area_max: number | null;
  purchase_date: string | null;
  financing: string | null;
  interest_level: string | null;
  first_contacted_at: string | null;
  last_activity_at: string | null;
  next_follow_up_at: string | null;
  next_follow_up_title: string | null;
  lost_reason: string | null;
  lost_notes: string | null;
  lost_at: string | null;
  client_id: string | null;
  converted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  property_code: string | null;
  property_title: string | null;
  property_status: string | null;
  property_price: number | null;
  property_currency: Currency | null;
  property_operation: string | null;
  property_image: string | null;
  client_name: string | null;
  tags: TagRef[];
}

export async function getLead(db: Db, id: string): Promise<LeadDetail | null> {
  return db.one<LeadDetail>(
    `select l.*, p.code as property_code, p.title as property_title, p.status as property_status, p.price as property_price,
            p.currency as property_currency, p.operation as property_operation,
            (select url from public.property_images pi where pi.property_id = p.id order by pi.is_cover desc, pi.position limit 1) as property_image,
            c.full_name as client_name,
            (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name), '[]'::json)
               from public.lead_tags lt join public.tags t on t.id = lt.tag_id where lt.lead_id = l.id) as tags
       from public.leads l
       left join public.properties p on p.id = l.property_id
       left join public.clients c on c.id = l.client_id
      where l.id = $1`,
    [id],
  );
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------
export interface DuplicateMatch {
  kind: "lead" | "client";
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
  phone_match: boolean;
  email_match: boolean;
}

export async function findDuplicates(db: Db, input: { phone?: string | null; email?: string | null; excludeId?: string | null }): Promise<DuplicateMatch[]> {
  const phone = nn(input.phone);
  const email = nn(input.email);
  if (!normalizePhone(phone) && !email) return [];
  return db.query<DuplicateMatch>("select * from public.find_duplicates($1, $2, $3)", [phone, email, input.excludeId ?? null]);
}

// ---------------------------------------------------------------------------
// Alta / edición
// ---------------------------------------------------------------------------
function profileParams(input: LeadInput) {
  return [
    nn(input.operationType),
    nn(input.propertyType),
    input.budgetMin ?? null,
    input.budgetMax ?? null,
    input.currency,
    input.districts,
    input.bedroomsMin ?? null,
    input.bathroomsMin ?? null,
    input.areaMin ?? null,
    input.areaMax ?? null,
    nn(input.purchaseDate),
    nn(input.financing),
    nn(input.interestLevel),
  ];
}

async function setLeadTagIds(db: Db, leadId: string, tagIds: string[]) {
  await db.query("delete from public.lead_tags where lead_id = $1 and not (tag_id = any($2::uuid[]))", [leadId, tagIds]);
  if (tagIds.length) {
    await db.query("insert into public.lead_tags (lead_id, tag_id) select $1, unnest($2::uuid[]) on conflict do nothing", [leadId, tagIds]);
  }
}

export async function createLead(
  db: Db,
  session: SessionUser,
  input: LeadInput,
  duplicateMode: string,
  labels: { source: (k: string) => string },
): Promise<{ id: string; merged: boolean }> {
  const phone = nn(input.phone);
  const email = nn(input.email);

  if (duplicateMode === "check") {
    const dups = await findDuplicates(db, { phone, email });
    if (dups.length > 0) throw new AppError("Posible lead duplicado", undefined, "duplicate", dups);
  }
  if (duplicateMode.startsWith("merge:")) {
    const [, kind, id] = duplicateMode.split(":");
    return mergeSubmissionIntoExisting(db, session, kind as "lead" | "client", id, input, labels);
  }

  // Asesores: los leads que crean quedan a su nombre; gerencia/asistentes pueden dejarlos sin asignar
  let assignedTo = nn(input.assignedTo);
  if (!assignedTo && session.role === "advisor") assignedTo = session.id;
  if (assignedTo && session.role === "advisor" && assignedTo !== session.id) {
    throw new ForbiddenError("Solo gerencia puede asignar leads a otros vendedores.");
  }

  const row = await db.one<{ id: string }>(
    `insert into public.leads (full_name, phone, email, source, priority, assigned_to, property_id, message,
        operation_type, property_type, budget_min, budget_max, currency, districts, bedrooms_min, bathrooms_min,
        area_min, area_max, purchase_date, financing, interest_level, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
     returning id`,
    [input.fullName, phone, email, input.source, input.priority, assignedTo, nn(input.propertyId), nn(input.message), ...profileParams(input), session.id],
  );
  const id = row!.id;
  await setLeadTagIds(db, id, input.tagIds);

  await logSystemEvent(db, { event: "lead_created", userId: session.id, leadId: id, propertyId: nn(input.propertyId), body: `Origen: ${labels.source(input.source)}${input.message ? ` · "${input.message}"` : ""}`, metadata: { source: input.source } });
  if (assignedTo) {
    const name = await db.scalar<string>("select full_name from public.users where id = $1", [assignedTo]);
    await logSystemEvent(db, { event: "assigned", userId: session.id, leadId: id, meta: { to: name }, metadata: { to: assignedTo } });
    await notify(db, {
      userId: assignedTo,
      actorId: session.id,
      type: "lead_assigned",
      title: `Nuevo lead asignado: ${input.fullName}`,
      body: `${labels.source(input.source)} · ${phone ?? email ?? ""}`,
      href: `/leads/${id}`,
      entityType: "lead",
      entityId: id,
      dedupeKey: notifKey.leadAssigned(id, assignedTo),
    });
  } else {
    await notifyManagers(db, { actorId: session.id, type: "lead_assigned", title: `Nuevo lead sin asignar: ${input.fullName}`, body: labels.source(input.source), href: `/leads/${id}`, entityType: "lead", entityId: id, dedupeKey: `lead_unassigned:${id}` });
  }
  await recomputeLeadScores(db, [id]);
  return { id, merged: false };
}

async function mergeSubmissionIntoExisting(
  db: Db,
  session: SessionUser,
  kind: "lead" | "client",
  targetId: string,
  input: LeadInput,
  labels: { source: (k: string) => string },
): Promise<{ id: string; merged: boolean }> {
  const note = `Nueva consulta (${labels.source(input.source)}) del mismo contacto${input.message ? `: "${input.message}"` : "."}`;
  if (kind === "lead") {
    const res = await db.one<{ id: string }>(
      `update public.leads set
         email = coalesce(email, $2), phone = coalesce(phone, $3),
         property_id = coalesce(property_id, $4),
         budget_max = coalesce(budget_max, $5), budget_min = coalesce(budget_min, $6)
       where id = $1 returning id`,
      [targetId, nn(input.email), nn(input.phone), nn(input.propertyId), input.budgetMax ?? null, input.budgetMin ?? null],
    );
    if (!res) throw new AppError("El lead existente pertenece a otro asesor. Pide a un gerente que lo fusione.");
    await db.query(
      `insert into public.activities (type, title, body, direction, responded, lead_id, property_id, user_id)
       values ('note', 'Consulta repetida (fusionada)', $2, 'inbound', true, $1, $3, $4)`,
      [targetId, note, nn(input.propertyId), session.id],
    );
    await logSystemEvent(db, { event: "merged", userId: session.id, leadId: targetId, meta: { name: input.fullName }, body: note });
    await recomputeLeadScores(db, [targetId]);
  } else {
    await db.query(
      `insert into public.activities (type, title, body, direction, responded, client_id, property_id, user_id)
       values ('note', 'Nueva consulta del cliente', $2, 'inbound', true, $1, $3, $4)`,
      [targetId, note, nn(input.propertyId), session.id],
    );
  }
  return { id: targetId, merged: true };
}

export async function updateLead(db: Db, session: SessionUser, id: string, input: LeadInput): Promise<void> {
  const current = await db.one<{ assigned_to: string | null }>("select assigned_to from public.leads where id = $1", [id]);
  if (!current) throw new AppError("No se encontró el lead o no tienes acceso a él.");
  let assignedTo = nn(input.assignedTo);
  if (session.role === "advisor") assignedTo = current.assigned_to ?? session.id; // los asesores no reasignan desde el formulario
  const res = await db.one<{ id: string }>(
    `update public.leads set full_name = $2, phone = $3, email = $4, source = $5, priority = $6, assigned_to = $7, property_id = $8, message = $9,
        operation_type = $10, property_type = $11, budget_min = $12, budget_max = $13, currency = $14, districts = $15, bedrooms_min = $16,
        bathrooms_min = $17, area_min = $18, area_max = $19, purchase_date = $20, financing = $21, interest_level = $22
      where id = $1 returning id`,
    [id, input.fullName, nn(input.phone), nn(input.email), input.source, input.priority, assignedTo, nn(input.propertyId), nn(input.message), ...profileParams(input)],
  );
  if (!res) throw new AppError("No tienes permiso para editar este lead.");
  await setLeadTagIds(db, id, input.tagIds);
  if (assignedTo !== current.assigned_to) {
    await assignLeads(db, session, [id], assignedTo, true);
  }
  await recomputeLeadScores(db, [id]);
}

export async function deleteLead(db: Db, id: string): Promise<void> {
  const opps = await db.scalar<number>("select count(*) from public.opportunities where lead_id = $1", [id]);
  const visits = await db.scalar<number>("select count(*) from public.visits where lead_id = $1", [id]);
  if (Number(opps) > 0 || Number(visits) > 0) {
    throw new AppError("Este lead tiene oportunidades o visitas registradas. Para conservar el historial, márcalo como perdido en lugar de eliminarlo.");
  }
  const res = await db.query("delete from public.leads where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No tienes permiso para eliminar este lead.");
}

// ---------------------------------------------------------------------------
// Asignación, etapa, prioridad, etiquetas
// ---------------------------------------------------------------------------
export async function assignLeads(db: Db, session: SessionUser, ids: string[], userId: string | null, moveOpenWork = true): Promise<number> {
  const leads = await db.query<{ id: string; full_name: string; assigned_to: string | null }>("select id, full_name, assigned_to from public.leads where id = any($1::uuid[])", [ids]);
  if (leads.length === 0) throw new AppError("No se encontraron los leads seleccionados.");

  if (!can(session.role, "leads.assign_any")) {
    if (userId !== session.id || leads.some((l) => l.assigned_to && l.assigned_to !== session.id)) {
      throw new ForbiddenError("Solo gerencia puede reasignar leads a otros vendedores. Puedes tomar los leads sin asignar.");
    }
  }
  const names = new Map((await db.query<{ id: string; full_name: string }>("select id, full_name from public.users")).map((u) => [u.id, u.full_name]));
  let changed = 0;
  for (const l of leads) {
    if (l.assigned_to === userId) continue;
    const res = await db.one<{ id: string }>("update public.leads set assigned_to = $2 where id = $1 returning id", [l.id, userId]);
    if (!res) throw new ForbiddenError("No tienes permiso para reasignar uno de los leads.");
    changed++;
    await logSystemEvent(db, { event: "assigned", userId: session.id, leadId: l.id, meta: { from: l.assigned_to ? names.get(l.assigned_to) : null, to: userId ? names.get(userId) : null }, metadata: { from: l.assigned_to, to: userId } });
    if (userId) {
      await notify(db, { userId, actorId: session.id, type: "lead_assigned", title: `Nuevo lead asignado: ${l.full_name}`, body: `Asignado por ${session.fullName}`, href: `/leads/${l.id}`, entityType: "lead", entityId: l.id, dedupeKey: notifKey.leadAssigned(l.id, userId) });
    }
    if (userId && moveOpenWork) {
      await db.query(
        `update public.opportunities set assigned_to = $2
          where lead_id = $1 and assigned_to is distinct from $2 and stage in (select key from public.pipeline_stages where kind = 'open')`,
        [l.id, userId],
      );
      if (l.assigned_to) {
        await db.query("update public.tasks set assigned_to = $2 where lead_id = $1 and assigned_to = $3 and status in ('pending', 'in_progress')", [l.id, userId, l.assigned_to]);
        await db.query("update public.visits set advisor_id = $2 where lead_id = $1 and advisor_id = $3 and status in ('scheduled', 'confirmed')", [l.id, userId, l.assigned_to]);
      }
    }
  }
  return changed;
}

export async function changeLeadStage(db: Db, session: SessionUser, id: string, stage: string): Promise<void> {
  const cur = await db.one<{ stage: string }>("select stage from public.leads where id = $1", [id]);
  if (!cur) throw new AppError("No se encontró el lead.");
  if (cur.stage === "won" || cur.stage === "lost") throw new AppError(cur.stage === "lost" ? "El lead está perdido: reactívalo para cambiar su etapa." : "El lead ya está cerrado.");
  if (cur.stage === stage) return;
  const res = await db.one<{ id: string }>("update public.leads set stage = $2 where id = $1 returning id", [id, stage]);
  if (!res) throw new AppError("No tienes permiso para modificar este lead.");
  await logSystemEvent(db, { event: "stage_changed", userId: session.id, leadId: id, meta: { from: labelOf(LEAD_STAGES, cur.stage), to: labelOf(LEAD_STAGES, stage) } });
  await recomputeLeadScores(db, [id]);
}

export async function setPriority(db: Db, table: "leads" | "opportunities", id: string, priority: string): Promise<void> {
  const res = await db.query(`update public.${table} set priority = $2 where id = $1 returning id`, [id, priority]);
  if (res.length === 0) throw new AppError("No tienes permiso para modificar este registro.");
}

export async function setEntityTags(db: Db, session: SessionUser, entity: "lead" | "client", id: string, tagIds: string[]): Promise<void> {
  if (entity === "lead") {
    await setLeadTagIds(db, id, tagIds);
    await logSystemEvent(db, { event: "tags_changed", userId: session.id, leadId: id });
  } else {
    await db.query("delete from public.client_tags where client_id = $1 and not (tag_id = any($2::uuid[]))", [id, tagIds]);
    if (tagIds.length) await db.query("insert into public.client_tags (client_id, tag_id) select $1, unnest($2::uuid[]) on conflict do nothing", [id, tagIds]);
    await logSystemEvent(db, { event: "tags_changed", userId: session.id, clientId: id });
  }
}

// ---------------------------------------------------------------------------
// Pérdida, reactivación, conversión, fusión
// ---------------------------------------------------------------------------
export async function markLeadLost(db: Db, session: SessionUser, id: string, reason: string, notes: string | null, lossLabel: (k: string) => string): Promise<void> {
  const lead = await db.one<{ id: string; stage: string }>("select id, stage from public.leads where id = $1", [id]);
  if (!lead) throw new AppError("No se encontró el lead.");
  if (lead.stage === "won") throw new AppError("El lead tiene una operación cerrada y no puede marcarse como perdido.");
  const res = await db.one<{ id: string }>(
    "update public.leads set stage = 'lost', lost_reason = $2, lost_notes = $3, lost_at = now() where id = $1 returning id",
    [id, reason, notes],
  );
  if (!res) throw new AppError("No tienes permiso para modificar este lead.");
  // Cierra el trabajo abierto del lead: oportunidades, tareas y visitas pendientes
  const opps = await db.query<{ id: string; property_id: string }>(
    `update public.opportunities set stage = 'lost', lost_reason = $2, lost_notes = $3
      where lead_id = $1 and stage in (select key from public.pipeline_stages where kind = 'open') returning id, property_id`,
    [id, reason, notes],
  );
  for (const o of opps) await logSystemEvent(db, { event: "lost", userId: session.id, leadId: id, opportunityId: o.id, propertyId: o.property_id, meta: { reason: lossLabel(reason) } });
  await db.query("update public.tasks set status = 'cancelled' where lead_id = $1 and status in ('pending', 'in_progress')", [id]);
  await db.query(
    "update public.visits set status = 'cancelled', cancel_reason = 'Lead marcado como perdido' where lead_id = $1 and status in ('scheduled', 'confirmed')",
    [id],
  );
  await logSystemEvent(db, { event: "lost", userId: session.id, leadId: id, meta: { reason: lossLabel(reason) }, body: notes });
  await recomputeLeadScores(db, [id]);
}

export async function reactivateLead(db: Db, session: SessionUser, id: string): Promise<void> {
  const lead = await db.one<{ id: string; stage: string; assigned_to: string | null; full_name: string; first_contacted_at: string | null }>(
    "select id, stage, assigned_to, full_name, first_contacted_at from public.leads where id = $1",
    [id],
  );
  if (!lead) throw new AppError("No se encontró el lead.");
  if (lead.stage !== "lost") throw new AppError("Solo se pueden reactivar leads perdidos.");
  const stage = lead.first_contacted_at ? "contacted" : "new";
  const res = await db.one<{ id: string }>("update public.leads set stage = $2, lost_reason = null, lost_notes = null, lost_at = null where id = $1 returning id", [id, stage]);
  if (!res) throw new AppError("No tienes permiso para modificar este lead.");
  await logSystemEvent(db, { event: "reactivated", userId: session.id, leadId: id });
  const assignee = lead.assigned_to ?? session.id;
  await db.query(
    `insert into public.tasks (title, kind, assigned_to, priority, due_at, lead_id, created_by)
     values ($1, 'follow_up', $2, 'medium', now() + interval '1 day', $3, $4)`,
    [`Retomar contacto con ${lead.full_name}`, assignee, id, session.id],
  );
  await recomputeLeadScores(db, [id]);
}

export async function convertLeadToClient(db: Db, session: SessionUser, leadId: string): Promise<{ clientId: string; created: boolean }> {
  const lead = await db.one<Record<string, unknown> & { id: string; client_id: string | null; full_name: string }>("select * from public.leads where id = $1", [leadId]);
  if (!lead) throw new AppError("No se encontró el lead.");
  if (lead.client_id) return { clientId: lead.client_id, created: false };

  const client = await db.one<{ id: string }>(
    `insert into public.clients (full_name, phone, email, source, assigned_to, operation_type, property_type, budget_min, budget_max, currency,
        districts, bedrooms_min, bathrooms_min, area_min, area_max, financing, purchase_date, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) returning id`,
    [
      lead.full_name, lead.phone, lead.email, lead.source, lead.assigned_to ?? session.id, lead.operation_type, lead.property_type, lead.budget_min,
      lead.budget_max, lead.currency, lead.districts, lead.bedrooms_min, lead.bathrooms_min, lead.area_min, lead.area_max, lead.financing, lead.purchase_date, session.id,
    ] as never[],
  );
  const clientId = client!.id;
  await db.query("update public.leads set client_id = $2, converted_at = now() where id = $1", [leadId, clientId]);
  await db.query("update public.opportunities set client_id = $2 where lead_id = $1 and client_id is null", [leadId, clientId]);
  await db.query("update public.visits set client_id = $2 where lead_id = $1 and client_id is null", [leadId, clientId]);
  await db.query("insert into public.client_tags (client_id, tag_id) select $2, tag_id from public.lead_tags where lead_id = $1 on conflict do nothing", [leadId, clientId]);
  await logSystemEvent(db, { event: "converted", userId: session.id, leadId, clientId });
  await logSystemEvent(db, { event: "client_created", userId: session.id, clientId, leadId });
  const owner = (lead.assigned_to as string | null) ?? session.id;
  await notify(db, { userId: owner, actorId: session.id, type: "client_new", title: `Nuevo cliente: ${lead.full_name}`, href: `/clients/${clientId}`, entityType: "client", entityId: clientId, dedupeKey: notifKey.clientNew(clientId) });
  await notifyManagers(db, { actorId: session.id, type: "client_new", title: `Nuevo cliente: ${lead.full_name}`, href: `/clients/${clientId}`, entityType: "client", entityId: clientId, dedupeKey: notifKey.clientNew(clientId) });
  return { clientId, created: true };
}

/** Fusiona un lead duplicado (source) dentro de otro (target) y elimina el duplicado. */
export async function mergeLeads(db: Db, session: SessionUser, sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new AppError("Selecciona dos leads distintos.");
  const [src, tgt] = await Promise.all([
    db.one<Record<string, unknown> & { full_name: string }>("select * from public.leads where id = $1", [sourceId]),
    db.one<Record<string, unknown> & { full_name: string }>("select * from public.leads where id = $1", [targetId]),
  ]);
  if (!src || !tgt) throw new AppError("No se encontró alguno de los leads.");

  // Rellena en el destino lo que le falta
  await db.query(
    `update public.leads t set
        phone = coalesce(t.phone, s.phone), email = coalesce(t.email, s.email), property_id = coalesce(t.property_id, s.property_id),
        operation_type = coalesce(t.operation_type, s.operation_type), property_type = coalesce(t.property_type, s.property_type),
        budget_min = coalesce(t.budget_min, s.budget_min), budget_max = coalesce(t.budget_max, s.budget_max),
        bedrooms_min = coalesce(t.bedrooms_min, s.bedrooms_min), bathrooms_min = coalesce(t.bathrooms_min, s.bathrooms_min),
        area_min = coalesce(t.area_min, s.area_min), area_max = coalesce(t.area_max, s.area_max),
        financing = coalesce(t.financing, s.financing), interest_level = coalesce(t.interest_level, s.interest_level),
        purchase_date = coalesce(t.purchase_date, s.purchase_date), assigned_to = coalesce(t.assigned_to, s.assigned_to),
        client_id = coalesce(t.client_id, s.client_id), districts = (select array(select distinct unnest(t.districts || s.districts)))
       from public.leads s where t.id = $1 and s.id = $2`,
    [targetId, sourceId],
  );
  for (const table of ["activities", "tasks", "visits", "opportunities", "notes", "documents"]) {
    await db.query(`update public.${table} set lead_id = $1 where lead_id = $2`, [targetId, sourceId]);
  }
  await db.query("delete from public.property_matches where lead_id = $2 and property_id in (select property_id from public.property_matches where lead_id = $1)", [targetId, sourceId]);
  await db.query("update public.property_matches set lead_id = $1 where lead_id = $2", [targetId, sourceId]);
  await db.query("insert into public.lead_tags (lead_id, tag_id) select $1, tag_id from public.lead_tags where lead_id = $2 on conflict do nothing", [targetId, sourceId]);
  const del = await db.query("delete from public.leads where id = $1 returning id", [sourceId]);
  if (del.length === 0) throw new AppError("No tienes permiso para eliminar el lead duplicado.");
  await logSystemEvent(db, { event: "merged", userId: session.id, leadId: targetId, meta: { name: src.full_name }, body: `Se fusionó el registro duplicado "${src.full_name}" en este lead.` });
  await recomputeLeadScores(db, [targetId]);
}

