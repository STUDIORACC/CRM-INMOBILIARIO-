import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/types";
import type { Currency, OperationType } from "@/lib/domain/constants";
import { eventTitle } from "@/lib/domain/events";
import { matchProperty, prefilterBounds, profileIsEmpty, type MatchReason, type MatchableProperty, type SearchProfile } from "@/lib/domain/matching";
import { AppError } from "@/lib/errors";
import { json } from "@/lib/db/types";
import { loadCatalogs } from "./catalogs";
import { logSystemEvent } from "./events";

export interface MatchedProperty {
  id: string;
  code: string;
  title: string;
  district: string;
  price: number;
  currency: Currency;
  operation: "sale" | "rent";
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  status: string;
  image: string | null;
  score: number;
  reasons: MatchReason[];
  saved: "suggested" | "sent" | "visit_scheduled" | "discarded" | null;
}

interface ProfileRow {
  operation_type: OperationType | null;
  property_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: Currency;
  districts: string[];
  bedrooms_min: number | null;
  bathrooms_min: number | null;
  area_min: number | null;
  area_max: number | null;
}

export const toProfile = (r: ProfileRow): SearchProfile => ({
  operationType: r.operation_type,
  propertyType: r.property_type,
  budgetMin: r.budget_min,
  budgetMax: r.budget_max,
  currency: r.currency,
  districts: r.districts ?? [],
  bedroomsMin: r.bedrooms_min,
  bathroomsMin: r.bathrooms_min,
  areaMin: r.area_min,
  areaMax: r.area_max,
});

interface CandidateRow {
  id: string;
  code: string;
  title: string;
  district: string;
  price: number;
  min_price: number | null;
  currency: Currency;
  operation: "sale" | "rent";
  property_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  total_area: number | null;
  built_area: number | null;
  status: string;
  image: string | null;
}

export async function matchForProfile(
  db: Db,
  profile: SearchProfile,
  opts: { limit?: number; minScore?: number; owner?: { leadId?: string; clientId?: string } } = {},
): Promise<{ profileEmpty: boolean; matches: MatchedProperty[] }> {
  if (profileIsEmpty(profile) || profile.operationType === "sell") return { profileEmpty: true, matches: [] };
  const catalogs = await loadCatalogs(db);
  const { usdRate } = catalogs.company;
  const bounds = prefilterBounds(profile, usdRate);
  const operation = profile.operationType === "rent" ? "rent" : profile.operationType ? "sale" : null;

  const params: Array<string | number | null> = [operation, bounds.maxPricePen, bounds.maxPriceUsd];
  const candidates = await db.query<CandidateRow>(
    `select p.id, p.code, p.title, p.district, p.price, p.min_price, p.currency, p.operation, p.property_type, p.bedrooms, p.bathrooms, p.total_area, p.built_area, p.status,
            (select url from public.property_images pi where pi.property_id = p.id order by pi.is_cover desc, pi.position limit 1) as image
       from public.properties p
      where p.status = 'available'
        and ($1::text is null or p.operation = $1)
        and ($2::numeric is null or (p.currency = 'PEN' and p.price <= $2) or (p.currency = 'USD' and p.price <= $3))
      limit 400`,
    params,
  );

  let saved = new Map<string, MatchedProperty["saved"]>();
  if (opts.owner?.leadId || opts.owner?.clientId) {
    const rows = await db.query<{ property_id: string; status: MatchedProperty["saved"] }>(
      "select property_id, status from public.property_matches where ($1::uuid is not null and lead_id = $1) or ($2::uuid is not null and client_id = $2)",
      [opts.owner.leadId ?? null, opts.owner.clientId ?? null],
    );
    saved = new Map(rows.map((r) => [r.property_id, r.status]));
  }

  const districtLabel = (k: string) => catalogs.districts.find((d) => d.key === k)?.label ?? k;
  const typeLabel = (k: string) => catalogs.propertyTypes.find((t) => t.key === k)?.label ?? k;
  const scored: MatchedProperty[] = [];
  for (const c of candidates) {
    const m: MatchableProperty = {
      id: c.id,
      operation: c.operation,
      propertyType: c.property_type,
      price: c.price,
      minPrice: c.min_price,
      currency: c.currency,
      district: c.district,
      bedrooms: c.bedrooms,
      bathrooms: c.bathrooms,
      totalArea: c.total_area,
      builtArea: c.built_area,
    };
    const res = matchProperty(profile, m, { usdRate, districtLabel, typeLabel });
    if (!res.eligible || res.score < (opts.minScore ?? 45)) continue;
    scored.push({
      id: c.id,
      code: c.code,
      title: c.title,
      district: c.district,
      price: c.price,
      currency: c.currency,
      operation: c.operation,
      propertyType: c.property_type,
      bedrooms: c.bedrooms,
      bathrooms: c.bathrooms,
      area: c.total_area ?? c.built_area,
      status: c.status,
      image: c.image,
      score: res.score,
      reasons: res.reasons,
      saved: saved.get(c.id) ?? null,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return { profileEmpty: false, matches: scored.slice(0, opts.limit ?? 12) };
}

export async function matchForLead(db: Db, leadId: string, limit = 12) {
  const row = await db.one<ProfileRow>("select operation_type, property_type, budget_min, budget_max, currency, districts, bedrooms_min, bathrooms_min, area_min, area_max from public.leads where id = $1", [leadId]);
  if (!row) throw new AppError("No se encontró el lead.");
  return matchForProfile(db, toProfile(row), { limit, owner: { leadId } });
}

export async function matchForClient(db: Db, clientId: string, limit = 12) {
  const row = await db.one<ProfileRow>("select operation_type, property_type, budget_min, budget_max, currency, districts, bedrooms_min, bathrooms_min, area_min, area_max from public.clients where id = $1", [clientId]);
  if (!row) throw new AppError("No se encontró el cliente.");
  return matchForProfile(db, toProfile(row), { limit, owner: { clientId } });
}

export interface InterestedParty {
  kind: "lead" | "client";
  id: string;
  name: string;
  phone: string | null;
  assigned_to: string | null;
  stage: string | null;
  score: number;
  reasons: MatchReason[];
}

/** Matching inverso: qué leads/clientes buscan algo parecido a esta propiedad. */
export async function matchForProperty(db: Db, propertyId: string, limit = 8): Promise<InterestedParty[]> {
  const catalogs = await loadCatalogs(db);
  const p = await db.one<CandidateRow>(
    `select p.id, p.code, p.title, p.district, p.price, p.min_price, p.currency, p.operation, p.property_type, p.bedrooms, p.bathrooms, p.total_area, p.built_area, p.status, null as image
       from public.properties p where p.id = $1`,
    [propertyId],
  );
  if (!p) return [];
  const prop: MatchableProperty = { id: p.id, operation: p.operation, propertyType: p.property_type, price: p.price, minPrice: p.min_price, currency: p.currency, district: p.district, bedrooms: p.bedrooms, bathrooms: p.bathrooms, totalArea: p.total_area, builtArea: p.built_area };
  const opFilter = p.operation === "rent" ? "('rent')" : "('buy', 'invest')";
  const cols = "operation_type, property_type, budget_min, budget_max, currency, districts, bedrooms_min, bathrooms_min, area_min, area_max";
  const [leads, clients] = await Promise.all([
    db.query<ProfileRow & { id: string; full_name: string; phone: string | null; assigned_to: string | null; stage: string }>(
      `select id, full_name, phone, assigned_to, stage, ${cols} from public.leads where stage not in ('won', 'lost') and operation_type in ${opFilter} limit 500`,
    ),
    db.query<ProfileRow & { id: string; full_name: string; phone: string | null; assigned_to: string | null }>(
      `select id, full_name, phone, assigned_to, ${cols} from public.clients where status = 'active' and operation_type in ${opFilter} limit 500`,
    ),
  ]);
  const ctx = { usdRate: catalogs.company.usdRate, districtLabel: (k: string) => catalogs.districts.find((d) => d.key === k)?.label ?? k, typeLabel: (k: string) => catalogs.propertyTypes.find((t) => t.key === k)?.label ?? k };
  const out: InterestedParty[] = [];
  for (const l of leads) {
    const res = matchProperty(toProfile(l), prop, ctx);
    if (res.eligible && res.score >= 60) out.push({ kind: "lead", id: l.id, name: l.full_name, phone: l.phone, assigned_to: l.assigned_to, stage: l.stage, score: res.score, reasons: res.reasons });
  }
  for (const c of clients) {
    const res = matchProperty(toProfile(c), prop, ctx);
    if (res.eligible && res.score >= 60) out.push({ kind: "client", id: c.id, name: c.full_name, phone: c.phone, assigned_to: c.assigned_to, stage: null, score: res.score, reasons: res.reasons });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/** Guarda la decisión sobre una propiedad sugerida (enviada / descartada / visita). */
export async function saveMatch(
  db: Db,
  session: SessionUser,
  input: { propertyId: string; leadId?: string | null; clientId?: string | null; status: "suggested" | "sent" | "visit_scheduled" | "discarded"; score: number; reasons: MatchReason[] },
): Promise<void> {
  const leadId = input.leadId || null;
  const clientId = input.clientId || null;
  if (!leadId && !clientId) throw new AppError("Indica el lead o cliente.");
  const target = leadId ? "lead_id" : "client_id";
  await db.query(
    `insert into public.property_matches (property_id, ${target}, score, reasons, status, sent_at, created_by)
     values ($1, $2, $3, $4, $5, case when $5 = 'sent' then now() end, $6)
     on conflict (property_id, ${target}) where ${target} is not null
     do update set status = excluded.status, score = excluded.score, reasons = excluded.reasons, sent_at = coalesce(excluded.sent_at, public.property_matches.sent_at)`,
    [input.propertyId, leadId ?? clientId, input.score, json(input.reasons), input.status, session.id],
  );
  if (input.status === "sent") {
    const code = await db.scalar<string>("select code from public.properties where id = $1", [input.propertyId]);
    await logSystemEvent(db, { event: "property_sent", userId: session.id, leadId, clientId, propertyId: input.propertyId, meta: { code }, body: `Compatibilidad ${input.score}%` });
  }
}

export { eventTitle };
