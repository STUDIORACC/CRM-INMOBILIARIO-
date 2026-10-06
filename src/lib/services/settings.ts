import type { Db } from "@/lib/db/types";
import { json } from "@/lib/db/types";
import { AppError } from "@/lib/errors";
import { nn } from "@/lib/validation/common";
import type { CatalogItemInput, CatalogName, CompanyInput, NotifyInput, StageInput, TemplateInput } from "@/lib/validation/settings";

export async function updateCompany(db: Db, input: CompanyInput): Promise<void> {
  await db.query(
    `update public.company_settings set name = $1, legal_name = $2, tax_id = $3, phone = $4, email = $5, address = $6, website = $7,
            currency = $8, usd_exchange_rate = $9, updated_at = now() where id = 1`,
    [input.name, nn(input.legalName), nn(input.taxId), nn(input.phone), nn(input.email), nn(input.address), nn(input.website), input.currency, input.usdRate],
  );
}

const slug = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "item";

export async function saveCatalogItem(db: Db, input: CatalogItemInput): Promise<{ id: string }> {
  const label = input.label.trim();
  const duplicate = await db.one<{ id: string }>("select id from public.catalog_items where catalog = $1 and lower(label) = lower($2) and ($3::uuid is null or id <> $3::uuid)", [input.catalog, label, input.id ?? null]);
  if (duplicate) throw new AppError("Ya existe un elemento con ese nombre.", { label: ["Ya existe"] });
  const color = nn(input.color);

  if (input.id) {
    const row = await db.one<{ id: string }>("update public.catalog_items set label = $2, color = $3, active = $4 where id = $1 returning id", [input.id, label, color, input.active ?? true]);
    if (!row) throw new AppError("No se encontró el elemento.");
    return row;
  }
  // Clave estable derivada del nombre (no se modifica al renombrar, para no romper registros existentes)
  const base = slug(label);
  let key = base;
  for (let i = 2; await db.one("select 1 from public.catalog_items where catalog = $1 and key = $2", [input.catalog, key]); i++) key = `${base}_${i}`;
  const position = Number((await db.scalar<number>("select coalesce(max(position), 0) + 1 from public.catalog_items where catalog = $1", [input.catalog])) ?? 1);
  const row = await db.one<{ id: string }>("insert into public.catalog_items (catalog, key, label, color, position, active) values ($1, $2, $3, $4, $5, $6) returning id", [input.catalog, key, label, color, position, input.active ?? true]);
  return row!;
}

/** Mueve un elemento una posición arriba o abajo dentro de su catálogo. */
export async function moveCatalogItem(db: Db, id: string, direction: "up" | "down"): Promise<void> {
  const item = await db.one<{ catalog: CatalogName; position: number }>("select catalog, position from public.catalog_items where id = $1", [id]);
  if (!item) throw new AppError("No se encontró el elemento.");
  const list = await db.query<{ id: string }>("select id from public.catalog_items where catalog = $1 order by position, label", [item.catalog]);
  const idx = list.findIndex((r) => r.id === id);
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swap < 0 || swap >= list.length) return;
  const ordered = list.map((r) => r.id);
  [ordered[idx], ordered[swap]] = [ordered[swap], ordered[idx]];
  for (let i = 0; i < ordered.length; i++) await db.query("update public.catalog_items set position = $2 where id = $1", [ordered[i], i + 1]);
}

export async function updateStage(db: Db, input: StageInput): Promise<void> {
  const stage = await db.one<{ kind: string }>("select kind from public.pipeline_stages where key = $1", [input.key]);
  if (!stage) throw new AppError("No se encontró la etapa.");
  const fixed = stage.kind === "won" ? 100 : stage.kind === "lost" ? 0 : null;
  if (fixed !== null && input.defaultProbability !== fixed) {
    throw new AppError(`La etapa ${stage.kind === "won" ? "ganada" : "perdida"} siempre tiene ${fixed}% de probabilidad.`, { defaultProbability: [`Debe ser ${fixed}%`] });
  }
  if (fixed === null && (input.defaultProbability === 0 || input.defaultProbability === 100)) {
    throw new AppError("Las etapas abiertas deben tener una probabilidad entre 10% y 90%.", { defaultProbability: ["Entre 10% y 90%"] });
  }
  await db.query("update public.pipeline_stages set label = $2, default_probability = $3, color = $4 where key = $1", [input.key, input.label, input.defaultProbability, input.color]);
}

export async function saveNotifySettings(db: Db, input: NotifyInput): Promise<void> {
  await db.query(
    `update public.company_settings set alert_lead_idle_days = $1, alert_opportunity_days = $2, alert_client_idle_days = $3,
            alert_first_response_h = $4, notify_settings = $5::jsonb, updated_at = now() where id = 1`,
    [input.alertLeadIdleDays, input.alertOpportunityDays, input.alertClientIdleDays, input.alertFirstResponseH, json(input.notify)],
  );
}

export async function saveTemplate(db: Db, input: TemplateInput): Promise<{ id: string }> {
  const duplicate = await db.one("select 1 from public.message_templates where lower(name) = lower($1) and channel = $2 and ($3::uuid is null or id <> $3::uuid)", [input.name.trim(), input.channel, input.id ?? null]);
  if (duplicate) throw new AppError("Ya existe una plantilla con ese nombre en este canal.", { name: ["Ya existe"] });
  if (input.id) {
    const row = await db.one<{ id: string }>(
      "update public.message_templates set name = $2, channel = $3, category = $4, subject = $5, body = $6, active = $7, updated_at = now() where id = $1 returning id",
      [input.id, input.name.trim(), input.channel, input.category, nn(input.subject), input.body, input.active ?? true],
    );
    if (!row) throw new AppError("No se encontró la plantilla o no tienes permiso para editarla.");
    return row;
  }
  const row = await db.one<{ id: string }>(
    "insert into public.message_templates (name, channel, category, subject, body, active) values ($1, $2, $3, $4, $5, $6) returning id",
    [input.name.trim(), input.channel, input.category, nn(input.subject), input.body, input.active ?? true],
  );
  return row!;
}

export async function deleteTemplate(db: Db, id: string): Promise<void> {
  const res = await db.query("delete from public.message_templates where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No se pudo eliminar la plantilla (sin permiso o ya no existe).");
}
