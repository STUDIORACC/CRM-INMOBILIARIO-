import type { SessionUser } from "@/lib/auth/session";
import { Filters, likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { AppError } from "@/lib/errors";
import { nn } from "@/lib/validation/common";
import type { OwnerInput, OwnerListQuery } from "@/lib/validation/clients";
import { logSystemEvent } from "./events";

export interface OwnerListRow {
  id: string;
  full_name: string;
  doc_type: string | null;
  doc_number: string | null;
  phone: string | null;
  email: string | null;
  owner_type: string;
  created_at: string;
  properties: number;
  active_properties: number;
  sold_properties: number;
  rented_properties: number;
}

const COLUMNS = `o.id, o.full_name, o.doc_type, o.doc_number, o.phone, o.email, o.owner_type, o.created_at,
  (select count(*) from public.properties p where p.owner_id = o.id)::int as properties,
  (select count(*) from public.properties p where p.owner_id = o.id and p.status in ('available', 'reserved'))::int as active_properties,
  (select count(*) from public.properties p where p.owner_id = o.id and p.status = 'sold')::int as sold_properties,
  (select count(*) from public.properties p where p.owner_id = o.id and p.status = 'rented')::int as rented_properties`;

export async function listOwners(db: Db, q: OwnerListQuery): Promise<{ rows: OwnerListRow[]; total: number }> {
  const f = new Filters();
  if (q.q) {
    const like = likePattern(q.q);
    f.add("(o.full_name ilike ? or o.doc_number ilike ? or o.phone ilike ? or o.email ilike ?)", like, like, like, like);
  }
  if (q.type) f.add("o.owner_type = ?", q.type);
  const total = await db.scalar<number>(`select count(*) from public.owners o ${f.where}`, f.params);
  const limit = f.param(q.pageSize);
  const offset = f.param((q.page - 1) * q.pageSize);
  const order = q.sort === "properties" ? "properties" : q.sort === "created_at" ? "o.created_at" : "lower(o.full_name)";
  const rows = await db.query<OwnerListRow>(`select ${COLUMNS} from public.owners o ${f.where} order by ${order} ${q.dir === "desc" ? "desc" : "asc"} limit ${limit} offset ${offset}`, f.params);
  return { rows, total: Number(total ?? 0) };
}

export interface OwnerDetail extends OwnerListRow {
  address: string | null;
  notes: string | null;
  created_by: string | null;
  updated_at: string;
  visits: number;
  operations: number;
  portfolio_value: number;
}

export async function getOwner(db: Db, id: string): Promise<OwnerDetail | null> {
  return db.one<OwnerDetail>(
    `select ${COLUMNS}, o.address, o.notes, o.created_by, o.updated_at,
        (select count(*) from public.visits v join public.properties p on p.id = v.property_id where p.owner_id = o.id)::int as visits,
        (select count(*) from public.opportunities op join public.properties p on p.id = op.property_id where p.owner_id = o.id and op.stage = 'won')::int as operations,
        coalesce((select sum(case when p.currency = 'USD' then p.price * (select usd_exchange_rate from public.company_settings where id = 1) else p.price end)
                    from public.properties p where p.owner_id = o.id and p.operation = 'sale' and p.status in ('available', 'reserved')), 0) as portfolio_value
       from public.owners o where o.id = $1`,
    [id],
  );
}

export async function getOwnerForEdit(db: Db, id: string) {
  const o = await getOwner(db, id);
  if (!o) return null;
  return {
    fullName: o.full_name,
    docType: o.doc_type ?? "",
    docNumber: o.doc_number ?? "",
    phone: o.phone ?? "",
    email: o.email ?? "",
    address: o.address ?? "",
    ownerType: o.owner_type as "individual" | "company" | "joint",
    notes: o.notes ?? "",
  };
}

export async function createOwner(db: Db, session: SessionUser, input: OwnerInput): Promise<{ id: string }> {
  if (input.docNumber) {
    const dup = await db.one<{ id: string; full_name: string }>("select id, full_name from public.owners where doc_number = $1 and ($2::text is null or doc_type = $2) limit 1", [input.docNumber, nn(input.docType)]);
    if (dup) throw new AppError(`Ya existe un propietario con ese documento: ${dup.full_name}.`, { docNumber: ["Documento ya registrado"] });
  }
  const row = await db.one<{ id: string }>(
    `insert into public.owners (full_name, doc_type, doc_number, phone, email, address, owner_type, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [input.fullName, nn(input.docType), nn(input.docNumber), nn(input.phone), nn(input.email), nn(input.address), input.ownerType, nn(input.notes), session.id],
  );
  await logSystemEvent(db, { event: "client_created", userId: session.id, ownerId: row!.id });
  return { id: row!.id };
}

export async function updateOwner(db: Db, id: string, input: OwnerInput): Promise<void> {
  const res = await db.one<{ id: string }>(
    `update public.owners set full_name = $2, doc_type = $3, doc_number = $4, phone = $5, email = $6, address = $7, owner_type = $8, notes = $9 where id = $1 returning id`,
    [id, input.fullName, nn(input.docType), nn(input.docNumber), nn(input.phone), nn(input.email), nn(input.address), input.ownerType, nn(input.notes)],
  );
  if (!res) throw new AppError("No tienes permiso para editar este propietario.");
}

export async function deleteOwner(db: Db, id: string): Promise<void> {
  const props = await db.scalar<number>("select count(*) from public.properties where owner_id = $1", [id]);
  if (Number(props) > 0) throw new AppError("Este propietario tiene propiedades asociadas. Reasígnalas antes de eliminarlo.");
  const res = await db.query("delete from public.owners where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No tienes permiso para eliminar este propietario.");
}
