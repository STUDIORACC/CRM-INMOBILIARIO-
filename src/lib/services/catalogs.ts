import type { Db } from "@/lib/db/types";
import type { Catalogs, CatalogItem, CompanyInfo, StageDef, TagDef, TeamUser, TemplateDef } from "@/lib/types/catalogs";

type CatalogName = "lead_source" | "loss_reason" | "property_type" | "district";

export async function loadCatalogs(db: Db): Promise<Catalogs> {
  const [items, stages, users, tags, templates, company] = await Promise.all([
    db.query<{ catalog: CatalogName; id: string; key: string; label: string; color: string | null; position: number; active: boolean }>(
      "select catalog, id, key, label, color, position, active from public.catalog_items order by catalog, position, label",
    ),
    db.query<{ key: string; label: string; position: number; kind: StageDef["kind"]; default_probability: number; color: string }>(
      "select key, label, position, kind, default_probability, color from public.pipeline_stages order by position",
    ),
    db.query<{ id: string; full_name: string; email: string; role: TeamUser["role"]; status: TeamUser["status"]; avatar_url: string | null; phone: string | null; hired_at: string }>(
      "select id, full_name, email, role, status, avatar_url, phone, hired_at from public.users order by full_name",
    ),
    db.query<TagDef>("select id, name, color from public.tags order by name"),
    db.query<{ id: string; name: string; channel: TemplateDef["channel"]; category: string; subject: string | null; body: string; active: boolean }>(
      "select id, name, channel, category, subject, body, active from public.message_templates order by category, name",
    ),
    db.one<{
      name: string; legal_name: string | null; tax_id: string | null; logo_url: string | null; phone: string | null; email: string | null;
      address: string | null; website: string | null; currency: "PEN" | "USD"; usd_exchange_rate: number;
      alert_lead_idle_days: number; alert_opportunity_days: number; alert_client_idle_days: number; alert_first_response_h: number;
      notify_settings: Record<string, boolean>;
    }>("select * from public.company_settings where id = 1"),
  ]);

  const byCatalog = (name: CatalogName): CatalogItem[] =>
    items.filter((i) => i.catalog === name).map((i) => ({ id: i.id, key: i.key, label: i.label, color: i.color, position: i.position, active: i.active }));

  const c = company;
  const info: CompanyInfo = {
    name: c?.name ?? "Mi Inmobiliaria",
    legalName: c?.legal_name ?? null,
    taxId: c?.tax_id ?? null,
    logoUrl: c?.logo_url ?? null,
    phone: c?.phone ?? null,
    email: c?.email ?? null,
    address: c?.address ?? null,
    website: c?.website ?? null,
    currency: c?.currency ?? "PEN",
    usdRate: Number(c?.usd_exchange_rate ?? 3.75),
    alertLeadIdleDays: c?.alert_lead_idle_days ?? 5,
    alertOpportunityDays: c?.alert_opportunity_days ?? 7,
    alertClientIdleDays: c?.alert_client_idle_days ?? 30,
    alertFirstResponseH: c?.alert_first_response_h ?? 2,
    notifySettings: c?.notify_settings ?? {},
  };

  return {
    sources: byCatalog("lead_source"),
    lossReasons: byCatalog("loss_reason"),
    propertyTypes: byCatalog("property_type"),
    districts: byCatalog("district"),
    stages: stages.map((s) => ({ key: s.key, label: s.label, position: s.position, kind: s.kind, defaultProbability: s.default_probability, color: s.color })),
    users: users.map((u) => ({ id: u.id, fullName: u.full_name, email: u.email, role: u.role, status: u.status, avatarUrl: u.avatar_url, phone: u.phone, hiredAt: u.hired_at })),
    tags,
    templates: templates.map((t) => ({ ...t })),
    company: info,
  };
}

export interface LabelFns {
  source: (k: string | null | undefined) => string;
  lossReason: (k: string | null | undefined) => string;
  district: (k: string | null | undefined) => string;
  propertyType: (k: string | null | undefined) => string;
}

/** Resuelve etiquetas de catálogo dentro de un servicio (títulos de eventos, notificaciones). */
export async function loadLabelFns(db: Db): Promise<LabelFns> {
  const items = await db.query<{ catalog: CatalogName; key: string; label: string }>("select catalog, key, label from public.catalog_items");
  const make = (cat: CatalogName) => {
    const map = new Map(items.filter((i) => i.catalog === cat).map((i) => [i.key, i.label]));
    return (k: string | null | undefined) => (k ? (map.get(k) ?? k) : "—");
  };
  return { source: make("lead_source"), lossReason: make("loss_reason"), district: make("district"), propertyType: make("property_type") };
}
