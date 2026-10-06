import type { SessionUser } from "@/lib/auth/session";
import { Filters, likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { PROPERTY_STATUSES, labelOf, type Currency } from "@/lib/domain/constants";
import { formatMoney } from "@/lib/domain/money";
import { AppError, ForbiddenError } from "@/lib/errors";
import { can } from "@/lib/domain/permissions";
import { nn } from "@/lib/validation/common";
import type { PropertyInput, PropertyListQuery } from "@/lib/validation/properties";
import { logSystemEvent } from "./events";

export interface PropertyListRow {
  id: string;
  code: string;
  title: string;
  property_type: string;
  operation: "sale" | "rent";
  price: number;
  currency: Currency;
  district: string;
  address: string | null;
  total_area: number | null;
  built_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number;
  status: string;
  publication_status: string;
  owner_id: string | null;
  owner_name: string | null;
  advisor_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  image: string | null;
  images_count: number;
  inquiries: number;
  visits: number;
  open_opportunities: number;
}

const DISTRICT_PREFIX: Record<string, string> = {
  miraflores: "MF", san_isidro: "SI", barranco: "BA", surco: "SU", la_molina: "LM", san_borja: "SB", surquillo: "SQ", san_miguel: "SM",
  magdalena: "MG", pueblo_libre: "PL", jesus_maria: "JM", lince: "LI", brena: "BR", cercado: "CL", san_martin_de_porres: "SMP", los_olivos: "LO",
  chorrillos: "CH", ate: "AT", callao: "CA",
};

export function districtPrefix(key: string): string {
  return DISTRICT_PREFIX[key] ?? key.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() ?? "PR";
}

/** Siguiente código correlativo para el distrito (SM-025). */
export async function nextPropertyCode(db: Db, district: string): Promise<string> {
  const prefix = districtPrefix(district);
  const max = await db.scalar<number>(
    "select coalesce(max((regexp_match(code, '^' || $1 || '-(\\d+)$'))[1]::int), 0) from public.properties where code like $1 || '-%'",
    [prefix],
  );
  return `${prefix}-${String(Number(max ?? 0) + 1).padStart(3, "0")}`;
}

const SORTS: Record<PropertyListQuery["sort"], string> = {
  updated_at: "p.updated_at",
  created_at: "p.created_at",
  price: "(case when p.currency = 'USD' then p.price * (select usd_exchange_rate from public.company_settings where id = 1) else p.price end)",
  code: "p.code",
  district: "p.district",
  total_area: "p.total_area",
};

const COLUMNS = `p.id, p.code, p.title, p.property_type, p.operation, p.price, p.currency, p.district, p.address, p.total_area, p.built_area, p.bedrooms, p.bathrooms,
  p.parking, p.status, p.publication_status, p.owner_id, ow.full_name as owner_name, p.advisor_id, p.published_at, p.created_at, p.updated_at,
  (select url from public.property_images pi where pi.property_id = p.id order by pi.is_cover desc, pi.position limit 1) as image,
  (select count(*) from public.property_images pi where pi.property_id = p.id)::int as images_count,
  (select count(*) from public.leads l where l.property_id = p.id)::int as inquiries,
  (select count(*) from public.visits v where v.property_id = p.id and v.status = 'completed')::int as visits,
  (select count(*) from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open' where o.property_id = p.id)::int as open_opportunities`;

function propertyFilters(q: PropertyListQuery): Filters {
  const f = new Filters();
  if (q.q) {
    const like = likePattern(q.q);
    f.add("(p.code ilike ? or p.title ilike ? or p.address ilike ? or ow.full_name ilike ?)", like, like, like, like);
  }
  if (q.status.length) f.add("p.status = any(?::text[])", q.status);
  if (q.publication.length) f.add("p.publication_status = any(?::text[])", q.publication);
  if (q.operation) f.add("p.operation = ?", q.operation);
  if (q.type) f.add("p.property_type = ?", q.type);
  if (q.district) f.add("p.district = ?", q.district);
  if (q.advisor) f.add("p.advisor_id = ?::uuid", q.advisor);
  if (q.owner) f.add("p.owner_id = ?::uuid", q.owner);
  if (q.priceMin != null) f.add("p.price >= ?", q.priceMin);
  if (q.priceMax != null) f.add("p.price <= ?", q.priceMax);
  if (q.bedrooms != null) f.add("p.bedrooms >= ?", q.bedrooms);
  if (q.quiet) {
    f.raw(`p.status = 'available' and p.created_at < now() - interval '14 days'
      and not exists (select 1 from public.leads l where l.property_id = p.id and l.created_at > now() - interval '30 days')
      and not exists (select 1 from public.visits v where v.property_id = p.id and v.scheduled_at > now() - interval '30 days')`);
  }
  return f;
}

const FROM = "from public.properties p left join public.owners ow on ow.id = p.owner_id";

export async function listProperties(db: Db, q: PropertyListQuery): Promise<{ rows: PropertyListRow[]; total: number }> {
  const f = propertyFilters(q);
  const total = await db.scalar<number>(`select count(*) ${FROM} ${f.where}`, f.params);
  const limit = f.param(q.pageSize);
  const offset = f.param((q.page - 1) * q.pageSize);
  const rows = await db.query<PropertyListRow>(
    `select ${COLUMNS} ${FROM} ${f.where} order by ${SORTS[q.sort]} ${q.dir === "asc" ? "asc" : "desc"} nulls last, p.code limit ${limit} offset ${offset}`,
    f.params,
  );
  return { rows, total: Number(total ?? 0) };
}

export async function exportProperties(db: Db, q: PropertyListQuery): Promise<PropertyListRow[]> {
  const f = propertyFilters(q);
  return db.query<PropertyListRow>(`select ${COLUMNS} ${FROM} ${f.where} order by p.code limit 20000`, f.params);
}

/** Conteo de propiedades sin movimiento (chip de alerta en la lista). */
export async function quietPropertiesCount(db: Db): Promise<number> {
  return Number(
    (await db.scalar<number>(`select count(*) from public.properties p where p.status = 'available' and p.created_at < now() - interval '14 days'
      and not exists (select 1 from public.leads l where l.property_id = p.id and l.created_at > now() - interval '30 days')
      and not exists (select 1 from public.visits v where v.property_id = p.id and v.scheduled_at > now() - interval '30 days')`)) ?? 0,
  );
}

export interface PropertyDetail {
  id: string;
  code: string;
  title: string;
  description: string | null;
  property_type: string;
  operation: "sale" | "rent";
  price: number;
  currency: Currency;
  min_price: number | null;
  commission_pct: number | null;
  district: string;
  province: string;
  address: string | null;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
  total_area: number | null;
  built_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number;
  age_years: number | null;
  floor: number | null;
  elevator: boolean;
  furnished: boolean;
  features: string[];
  status: string;
  publication_status: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  advisor_id: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyImageRow {
  id: string;
  url: string;
  caption: string | null;
  position: number;
  is_cover: boolean;
  storage_path: string | null;
}

export async function getProperty(db: Db, id: string): Promise<PropertyDetail | null> {
  return db.one<PropertyDetail>(
    `select p.*, ow.full_name as owner_name, ow.phone as owner_phone from public.properties p left join public.owners ow on ow.id = p.owner_id where p.id = $1`,
    [id],
  );
}

export const listPropertyImages = (db: Db, id: string) =>
  db.query<PropertyImageRow>("select id, url, caption, position, is_cover, storage_path from public.property_images where property_id = $1 order by is_cover desc, position, created_at", [id]);

export const listPriceHistory = (db: Db, id: string) =>
  db.query<{ id: string; old_price: number | null; new_price: number; currency: Currency; changed_by: string | null; changed_at: string }>(
    "select id, old_price, new_price, currency, changed_by, changed_at from public.property_price_history where property_id = $1 order by changed_at desc",
    [id],
  );

export interface PropertyStats {
  inquiries: number;
  visits_done: number;
  visits_pending: number;
  open_opportunities: number;
  days_listed: number;
}

export async function propertyStats(db: Db, id: string): Promise<PropertyStats> {
  const r = await db.one<PropertyStats>(
    `select (select count(*) from public.leads where property_id = $1)::int as inquiries,
            (select count(*) from public.visits where property_id = $1 and status = 'completed')::int as visits_done,
            (select count(*) from public.visits where property_id = $1 and status in ('scheduled', 'confirmed'))::int as visits_pending,
            (select count(*) from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open' where o.property_id = $1)::int as open_opportunities,
            greatest(0, floor(extract(epoch from (now() - coalesce((select published_at from public.properties where id = $1), (select created_at from public.properties where id = $1)))) / 86400))::int as days_listed`,
    [id],
  );
  return r!;
}

export async function getPropertyForEdit(db: Db, id: string): Promise<PropertyInput | null> {
  const p = await getProperty(db, id);
  if (!p) return null;
  return {
    code: p.code,
    title: p.title,
    description: p.description ?? "",
    propertyType: p.property_type,
    operation: p.operation,
    price: p.price,
    currency: p.currency,
    minPrice: p.min_price,
    commissionPct: p.commission_pct,
    district: p.district,
    province: p.province,
    address: p.address ?? "",
    reference: p.reference ?? "",
    latitude: p.latitude,
    longitude: p.longitude,
    totalArea: p.total_area,
    builtArea: p.built_area,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    parking: p.parking,
    ageYears: p.age_years,
    floor: p.floor,
    elevator: p.elevator,
    furnished: p.furnished,
    features: p.features,
    status: p.status as PropertyInput["status"],
    publicationStatus: p.publication_status as PropertyInput["publicationStatus"],
    ownerId: p.owner_id ?? "",
    advisorId: p.advisor_id ?? "",
  };
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------
function canEditProperty(session: SessionUser, advisorId: string | null): boolean {
  return can(session.role, "properties.edit_any") || (session.role === "advisor" && advisorId === session.id);
}

export async function createProperty(db: Db, session: SessionUser, input: PropertyInput): Promise<{ id: string; code: string }> {
  if (!can(session.role, "properties.create")) throw new ForbiddenError("Tu rol no puede registrar propiedades.");
  let advisorId = nn(input.advisorId);
  if (session.role === "advisor") advisorId = session.id;
  if (!advisorId) advisorId = session.id;
  const code = (input.code ?? "").trim().toUpperCase() || (await nextPropertyCode(db, input.district));
  const published = input.publicationStatus === "published";
  const row = await db.one<{ id: string }>(
    `insert into public.properties (code, title, description, property_type, operation, price, currency, min_price, commission_pct, district, province, address, reference,
        latitude, longitude, total_area, built_area, bedrooms, bathrooms, parking, age_years, floor, elevator, furnished, features, status, publication_status,
        owner_id, advisor_id, published_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
     returning id`,
    [
      code, input.title, nn(input.description), input.propertyType, input.operation, input.price, input.currency, input.minPrice ?? null, input.commissionPct ?? null,
      input.district, input.province, nn(input.address), nn(input.reference), input.latitude ?? null, input.longitude ?? null, input.totalArea ?? null, input.builtArea ?? null,
      input.bedrooms ?? null, input.bathrooms ?? null, input.parking ?? 0, input.ageYears ?? null, input.floor ?? null, input.elevator, input.furnished, input.features,
      input.status, input.publicationStatus, nn(input.ownerId), advisorId, published ? new Date() : null, session.id,
    ],
  );
  await logSystemEvent(db, { event: "property_listed", userId: session.id, propertyId: row!.id, ownerId: nn(input.ownerId), meta: { code } });
  return { id: row!.id, code };
}

export async function updateProperty(db: Db, session: SessionUser, id: string, input: PropertyInput): Promise<void> {
  const cur = await db.one<{ advisor_id: string | null; code: string; status: string }>("select advisor_id, code, status from public.properties where id = $1", [id]);
  if (!cur) throw new AppError("No se encontró la propiedad.");
  if (!canEditProperty(session, cur.advisor_id)) throw new ForbiddenError("Solo el asesor responsable o gerencia pueden editar esta propiedad.");
  let advisorId = nn(input.advisorId) ?? cur.advisor_id;
  if (session.role === "advisor") advisorId = cur.advisor_id;
  const code = (input.code ?? "").trim().toUpperCase() || cur.code;
  const res = await db.one<{ id: string }>(
    `update public.properties set code = $2, title = $3, description = $4, property_type = $5, operation = $6, price = $7, currency = $8, min_price = $9, commission_pct = $10,
        district = $11, province = $12, address = $13, reference = $14, latitude = $15, longitude = $16, total_area = $17, built_area = $18, bedrooms = $19, bathrooms = $20,
        parking = $21, age_years = $22, floor = $23, elevator = $24, furnished = $25, features = $26, status = $27, publication_status = $28, owner_id = $29, advisor_id = $30
      where id = $1 returning id`,
    [
      id, code, input.title, nn(input.description), input.propertyType, input.operation, input.price, input.currency, input.minPrice ?? null, input.commissionPct ?? null,
      input.district, input.province, nn(input.address), nn(input.reference), input.latitude ?? null, input.longitude ?? null, input.totalArea ?? null, input.builtArea ?? null,
      input.bedrooms ?? null, input.bathrooms ?? null, input.parking ?? 0, input.ageYears ?? null, input.floor ?? null, input.elevator, input.furnished, input.features,
      input.status, input.publicationStatus, nn(input.ownerId), advisorId,
    ],
  );
  if (!res) throw new ForbiddenError("No tienes permiso para editar esta propiedad.");
  if (cur.status !== input.status) {
    await logSystemEvent(db, { event: "property_status", userId: session.id, propertyId: id, meta: { from: labelOf(PROPERTY_STATUSES, cur.status), to: labelOf(PROPERTY_STATUSES, input.status) } });
  }
}

export async function changePropertyState(db: Db, session: SessionUser, id: string, patch: { status?: string; publicationStatus?: string }): Promise<void> {
  const cur = await db.one<{ advisor_id: string | null; status: string; publication_status: string }>("select advisor_id, status, publication_status from public.properties where id = $1", [id]);
  if (!cur) throw new AppError("No se encontró la propiedad.");
  if (!canEditProperty(session, cur.advisor_id)) throw new ForbiddenError("Solo el asesor responsable o gerencia pueden cambiar el estado.");
  const status = patch.status ?? cur.status;
  const publication = patch.publicationStatus ?? cur.publication_status;
  await db.query("update public.properties set status = $2, publication_status = $3 where id = $1", [id, status, publication]);
  if (patch.status && patch.status !== cur.status) {
    await logSystemEvent(db, { event: "property_status", userId: session.id, propertyId: id, meta: { from: labelOf(PROPERTY_STATUSES, cur.status), to: labelOf(PROPERTY_STATUSES, status) } });
  }
}

export async function changePrice(db: Db, session: SessionUser, id: string, price: number, minPrice: number | null): Promise<void> {
  const cur = await db.one<{ advisor_id: string | null; price: number; currency: Currency }>("select advisor_id, price, currency from public.properties where id = $1", [id]);
  if (!cur) throw new AppError("No se encontró la propiedad.");
  if (!canEditProperty(session, cur.advisor_id)) throw new ForbiddenError("Solo el asesor responsable o gerencia pueden cambiar el precio.");
  if (minPrice != null && minPrice > price) throw new AppError("El precio mínimo no puede superar al precio de lista.", { minPrice: ["Mayor al precio"] });
  await db.query("update public.properties set price = $2, min_price = $3 where id = $1", [id, price, minPrice]);
  if (price !== cur.price) {
    await logSystemEvent(db, { event: "price_changed", userId: session.id, propertyId: id, meta: { from: formatMoney(cur.price, cur.currency), to: formatMoney(price, cur.currency) } });
  }
}

export async function deleteProperty(db: Db, id: string): Promise<void> {
  const rel = await db.scalar<number>("select (select count(*) from public.opportunities where property_id = $1)", [id]);
  if (Number(rel) > 0) throw new AppError("La propiedad tiene oportunidades asociadas. Cámbiala a Retirada para conservar el historial.");
  const res = await db.query("delete from public.properties where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No tienes permiso para eliminar esta propiedad.");
}

// Imágenes ---------------------------------------------------------------
async function assertCanEditImages(db: Db, session: SessionUser, propertyId: string) {
  const p = await db.one<{ advisor_id: string | null }>("select advisor_id from public.properties where id = $1", [propertyId]);
  if (!p) throw new AppError("No se encontró la propiedad.");
  if (!canEditProperty(session, p.advisor_id)) throw new ForbiddenError("Solo el asesor responsable o gerencia pueden administrar las fotos.");
}

export async function addPropertyImage(db: Db, session: SessionUser, propertyId: string, url: string, caption: string | null, storagePath: string | null): Promise<{ id: string }> {
  await assertCanEditImages(db, session, propertyId);
  const count = await db.scalar<number>("select count(*) from public.property_images where property_id = $1", [propertyId]);
  if (Number(count) >= 30) throw new AppError("Máximo 30 imágenes por propiedad.");
  const row = await db.one<{ id: string }>(
    `insert into public.property_images (property_id, url, storage_path, caption, position, is_cover)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [propertyId, url, storagePath, caption, Number(count ?? 0), Number(count) === 0],
  );
  return { id: row!.id };
}

export async function setCoverImage(db: Db, session: SessionUser, propertyId: string, imageId: string): Promise<void> {
  await assertCanEditImages(db, session, propertyId);
  await db.query("update public.property_images set is_cover = false where property_id = $1 and is_cover", [propertyId]);
  await db.query("update public.property_images set is_cover = true where id = $1 and property_id = $2", [imageId, propertyId]);
}

export async function moveImage(db: Db, session: SessionUser, propertyId: string, imageId: string, direction: -1 | 1): Promise<void> {
  await assertCanEditImages(db, session, propertyId);
  const imgs = await db.query<{ id: string }>("select id from public.property_images where property_id = $1 order by position, created_at", [propertyId]);
  const i = imgs.findIndex((x) => x.id === imageId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= imgs.length) return;
  [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
  for (let k = 0; k < imgs.length; k++) await db.query("update public.property_images set position = $2 where id = $1", [imgs[k].id, k]);
}

export async function deleteImage(db: Db, session: SessionUser, propertyId: string, imageId: string): Promise<{ storagePath: string | null }> {
  await assertCanEditImages(db, session, propertyId);
  const row = await db.one<{ storage_path: string | null; is_cover: boolean }>("delete from public.property_images where id = $1 and property_id = $2 returning storage_path, is_cover", [imageId, propertyId]);
  if (!row) throw new AppError("No se encontró la imagen.");
  if (row.is_cover) await db.query("update public.property_images set is_cover = true where id = (select id from public.property_images where property_id = $1 order by position limit 1)", [propertyId]);
  return { storagePath: row.storage_path };
}
