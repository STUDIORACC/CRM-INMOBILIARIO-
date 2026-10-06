import type { SessionUser } from "@/lib/auth/session";
import { Filters, likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import type { Currency } from "@/lib/domain/constants";
import { addDaysIso, startOfDayIso } from "@/lib/domain/dates";
import { notifKey } from "@/lib/domain/events";
import { AppError, ForbiddenError } from "@/lib/errors";
import { nn } from "@/lib/validation/common";
import type { ClientInput, ClientListQuery } from "@/lib/validation/clients";
import { loadThresholds } from "./alerts";
import { logSystemEvent, notify, notifyManagers } from "./events";
import { findDuplicates, type DuplicateMatch, type TagRef } from "./leads";

export interface ClientListRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  doc_type: string | null;
  doc_number: string | null;
  source: string | null;
  assigned_to: string | null;
  operation_type: string | null;
  property_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: Currency;
  districts: string[];
  last_activity_at: string | null;
  created_at: string;
  status: string;
  open_opportunities: number;
  visits_done: number;
  tags: TagRef[];
}

const digits = (s: string) => s.replace(/\D/g, "");
const SORTS: Record<ClientListQuery["sort"], string> = { created_at: "c.created_at", full_name: "lower(c.full_name)", last_activity_at: "c.last_activity_at", budget_max: "c.budget_max" };

async function clientFilters(db: Db, q: ClientListQuery): Promise<Filters> {
  const f = new Filters();
  if (q.q) {
    const like = likePattern(q.q);
    const d = digits(q.q);
    if (d.length >= 3) f.add("(c.full_name ilike ? or c.email ilike ? or c.doc_number ilike ? or c.phone_normalized like ?)", like, like, like, `%${d}%`);
    else f.add("(c.full_name ilike ? or c.email ilike ? or c.doc_number ilike ?)", like, like, like);
  }
  if (q.assigned === "none") f.raw("c.assigned_to is null");
  else if (q.assigned) f.add("c.assigned_to = ?::uuid", q.assigned);
  if (q.tag.length) f.add("exists (select 1 from public.client_tags ct where ct.client_id = c.id and ct.tag_id = any(?::uuid[]))", q.tag);
  if (q.district) f.add("? = any(c.districts)", q.district);
  if (q.operation) f.add("c.operation_type = ?", q.operation);
  if (q.idle) {
    const t = await loadThresholds(db);
    f.raw(`c.status = 'active' and coalesce(c.last_activity_at, c.created_at) < now() - interval '${Math.max(1, Math.trunc(t.clientIdleDays))} days'`);
  }
  const from = q.from ? startOfDayIso(q.from) : null;
  if (from) f.add("c.created_at >= ?::timestamptz", from);
  const to = q.to ? startOfDayIso(q.to) : null;
  if (to) f.add("c.created_at < ?::timestamptz", addDaysIso(to, 1));
  return f;
}

const COLUMNS = `c.id, c.full_name, c.phone, c.email, c.doc_type, c.doc_number, c.source, c.assigned_to, c.operation_type, c.property_type, c.budget_min, c.budget_max,
  c.currency, c.districts, c.last_activity_at, c.created_at, c.status,
  (select count(*) from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open' where o.client_id = c.id)::int as open_opportunities,
  (select count(*) from public.visits v where v.client_id = c.id and v.status = 'completed')::int as visits_done,
  (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name), '[]'::json)
     from public.client_tags ct join public.tags t on t.id = ct.tag_id where ct.client_id = c.id) as tags`;

export async function listClients(db: Db, q: ClientListQuery): Promise<{ rows: ClientListRow[]; total: number }> {
  const f = await clientFilters(db, q);
  const total = await db.scalar<number>(`select count(*) from public.clients c ${f.where}`, f.params);
  const limit = f.param(q.pageSize);
  const offset = f.param((q.page - 1) * q.pageSize);
  const rows = await db.query<ClientListRow>(
    `select ${COLUMNS} from public.clients c ${f.where} order by ${SORTS[q.sort]} ${q.dir === "asc" ? "asc" : "desc"} nulls last, c.created_at desc limit ${limit} offset ${offset}`,
    f.params,
  );
  return { rows, total: Number(total ?? 0) };
}

export async function exportClients(db: Db, q: ClientListQuery): Promise<ClientListRow[]> {
  const f = await clientFilters(db, q);
  return db.query<ClientListRow>(`select ${COLUMNS} from public.clients c ${f.where} order by c.created_at desc limit 20000`, f.params);
}

export interface ClientDetail extends Omit<ClientListRow, "open_opportunities" | "visits_done"> {
  address: string | null;
  bedrooms_min: number | null;
  bathrooms_min: number | null;
  area_min: number | null;
  area_max: number | null;
  financing: string | null;
  purchase_date: string | null;
  search_notes: string | null;
  updated_at: string;
  created_by: string | null;
  source_lead_id: string | null;
}

export async function getClient(db: Db, id: string): Promise<ClientDetail | null> {
  return db.one<ClientDetail>(
    `select c.*, (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name), '[]'::json)
        from public.client_tags ct join public.tags t on t.id = ct.tag_id where ct.client_id = c.id) as tags,
        (select l.id from public.leads l where l.client_id = c.id order by l.created_at limit 1) as source_lead_id
       from public.clients c where c.id = $1`,
    [id],
  );
}

export async function getClientForEdit(db: Db, id: string) {
  const c = await getClient(db, id);
  if (!c) return null;
  return {
    fullName: c.full_name,
    docType: c.doc_type ?? "",
    docNumber: c.doc_number ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    source: c.source ?? "",
    assignedTo: c.assigned_to ?? "",
    searchNotes: c.search_notes ?? "",
    purchaseDate: c.purchase_date ?? "",
    tagIds: c.tags.map((t) => t.id),
    operationType: c.operation_type ?? "",
    propertyType: c.property_type ?? "",
    budgetMin: c.budget_min,
    budgetMax: c.budget_max,
    currency: c.currency,
    districts: c.districts,
    bedroomsMin: c.bedrooms_min,
    bathroomsMin: c.bathrooms_min,
    areaMin: c.area_min,
    areaMax: c.area_max,
    financing: c.financing ?? "",
  };
}

export async function createClient(db: Db, session: SessionUser, input: ClientInput, duplicateMode: "check" | "create"): Promise<{ id: string }> {
  const phone = nn(input.phone);
  const email = nn(input.email);
  if (duplicateMode === "check") {
    const dups: DuplicateMatch[] = await findDuplicates(db, { phone, email });
    if (dups.length > 0) throw new AppError("Posible duplicado", undefined, "duplicate", dups);
  }
  let assignedTo = nn(input.assignedTo);
  if (!assignedTo && session.role === "advisor") assignedTo = session.id;
  if (assignedTo && session.role === "advisor" && assignedTo !== session.id) throw new ForbiddenError("Solo gerencia puede asignar clientes a otros vendedores.");

  const row = await db.one<{ id: string }>(
    `insert into public.clients (full_name, doc_type, doc_number, phone, email, address, source, assigned_to, search_notes, operation_type, property_type,
        budget_min, budget_max, currency, districts, bedrooms_min, bathrooms_min, area_min, area_max, financing, purchase_date, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) returning id`,
    [
      input.fullName, nn(input.docType), nn(input.docNumber), phone, email, nn(input.address), nn(input.source), assignedTo, nn(input.searchNotes),
      nn(input.operationType), nn(input.propertyType), input.budgetMin ?? null, input.budgetMax ?? null, input.currency, input.districts,
      input.bedroomsMin ?? null, input.bathroomsMin ?? null, input.areaMin ?? null, input.areaMax ?? null, nn(input.financing), nn(input.purchaseDate), session.id,
    ],
  );
  const id = row!.id;
  if (input.tagIds.length) await db.query("insert into public.client_tags (client_id, tag_id) select $1, unnest($2::uuid[]) on conflict do nothing", [id, input.tagIds]);
  await logSystemEvent(db, { event: "client_created", userId: session.id, clientId: id });
  if (assignedTo) await notify(db, { userId: assignedTo, actorId: session.id, type: "client_new", title: `Nuevo cliente: ${input.fullName}`, href: `/clients/${id}`, entityType: "client", entityId: id, dedupeKey: notifKey.clientNew(id) });
  await notifyManagers(db, { actorId: session.id, type: "client_new", title: `Nuevo cliente: ${input.fullName}`, href: `/clients/${id}`, entityType: "client", entityId: id, dedupeKey: notifKey.clientNew(id) });
  return { id };
}

export async function updateClient(db: Db, session: SessionUser, id: string, input: ClientInput): Promise<void> {
  const cur = await db.one<{ assigned_to: string | null }>("select assigned_to from public.clients where id = $1", [id]);
  if (!cur) throw new AppError("No se encontró el cliente o no tienes acceso a él.");
  let assignedTo = nn(input.assignedTo);
  if (session.role === "advisor") assignedTo = cur.assigned_to ?? session.id;
  const res = await db.one<{ id: string }>(
    `update public.clients set full_name = $2, doc_type = $3, doc_number = $4, phone = $5, email = $6, address = $7, source = $8, assigned_to = $9, search_notes = $10,
        operation_type = $11, property_type = $12, budget_min = $13, budget_max = $14, currency = $15, districts = $16, bedrooms_min = $17, bathrooms_min = $18,
        area_min = $19, area_max = $20, financing = $21, purchase_date = $22
      where id = $1 returning id`,
    [
      id, input.fullName, nn(input.docType), nn(input.docNumber), nn(input.phone), nn(input.email), nn(input.address), nn(input.source), assignedTo, nn(input.searchNotes),
      nn(input.operationType), nn(input.propertyType), input.budgetMin ?? null, input.budgetMax ?? null, input.currency, input.districts, input.bedroomsMin ?? null,
      input.bathroomsMin ?? null, input.areaMin ?? null, input.areaMax ?? null, nn(input.financing), nn(input.purchaseDate),
    ],
  );
  if (!res) throw new AppError("No tienes permiso para editar este cliente.");
  await db.query("delete from public.client_tags where client_id = $1 and not (tag_id = any($2::uuid[]))", [id, input.tagIds]);
  if (input.tagIds.length) await db.query("insert into public.client_tags (client_id, tag_id) select $1, unnest($2::uuid[]) on conflict do nothing", [id, input.tagIds]);
}

export async function deleteClient(db: Db, id: string): Promise<void> {
  const rel = await db.scalar<number>("select (select count(*) from public.opportunities where client_id = $1) + (select count(*) from public.visits where client_id = $1)", [id]);
  if (Number(rel) > 0) throw new AppError("Este cliente tiene oportunidades o visitas registradas. Para conservar el historial, no se puede eliminar; márcalo como inactivo.");
  const res = await db.query("delete from public.clients where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No tienes permiso para eliminar este cliente.");
}

export async function setClientStatus(db: Db, id: string, status: "active" | "inactive"): Promise<void> {
  const res = await db.query("update public.clients set status = $2 where id = $1 returning id", [id, status]);
  if (res.length === 0) throw new AppError("No tienes permiso para modificar este cliente.");
}
