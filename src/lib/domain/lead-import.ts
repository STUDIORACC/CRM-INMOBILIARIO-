import { leadSchema, type LeadInput } from "@/lib/validation/leads";

/** Campos que se pueden importar y los encabezados que se reconocen automáticamente. */
export const IMPORT_FIELDS = [
  { key: "fullName", label: "Nombre completo", required: true, aliases: ["nombre", "nombres", "nombre completo", "cliente", "contacto", "full name", "name", "lead"] },
  { key: "phone", label: "Teléfono / WhatsApp", required: false, aliases: ["telefono", "teléfono", "celular", "movil", "móvil", "whatsapp", "cel", "phone", "mobile", "numero", "número"] },
  { key: "email", label: "Correo electrónico", required: false, aliases: ["email", "e-mail", "correo", "correo electronico", "mail"] },
  { key: "source", label: "Fuente", required: false, aliases: ["fuente", "origen", "canal", "source", "medio"] },
  { key: "message", label: "Mensaje / notas", required: false, aliases: ["mensaje", "notas", "nota", "comentario", "comentarios", "observaciones", "consulta", "message", "notes"] },
  { key: "operationType", label: "Operación (compra, alquiler…)", required: false, aliases: ["operacion", "operación", "tipo de operacion", "busca", "interes", "interés"] },
  { key: "propertyType", label: "Tipo de propiedad", required: false, aliases: ["tipo", "tipo de propiedad", "tipo de inmueble", "inmueble", "propiedad"] },
  { key: "districts", label: "Distritos de interés", required: false, aliases: ["distrito", "distritos", "zona", "zonas", "ubicacion", "ubicación"] },
  { key: "budgetMin", label: "Presupuesto mínimo", required: false, aliases: ["presupuesto minimo", "presupuesto mínimo", "desde", "minimo", "mínimo", "budget min"] },
  { key: "budgetMax", label: "Presupuesto máximo", required: false, aliases: ["presupuesto", "presupuesto maximo", "presupuesto máximo", "hasta", "maximo", "máximo", "budget", "budget max"] },
  { key: "currency", label: "Moneda", required: false, aliases: ["moneda", "currency"] },
  { key: "priority", label: "Prioridad", required: false, aliases: ["prioridad", "priority"] },
  { key: "assignedTo", label: "Vendedor (nombre o correo)", required: false, aliases: ["vendedor", "asesor", "responsable", "asignado", "asignado a", "agente", "owner"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ImportMapping = Partial<Record<ImportFieldKey, string>>;
export type RawImportRow = Partial<Record<ImportFieldKey, string>>;

export const MAX_IMPORT_ROWS = 2000;

/** Quita tildes, signos y mayúsculas para comparar encabezados y etiquetas. */
export const fold = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Propone un mapeo de columnas a partir de los encabezados del archivo. */
export function guessMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const used = new Set<string>();
  const folded = headers.map((h) => ({ h, f: fold(h) }));
  const aliasesOf = (field: (typeof IMPORT_FIELDS)[number]) => [fold(field.label), ...field.aliases.map(fold)];
  // 1.ª pasada: coincidencias exactas (evita que "Presupuesto" caiga en "Presupuesto mínimo")
  for (const field of IMPORT_FIELDS) {
    const hit = folded.find((c) => !used.has(c.h) && aliasesOf(field).includes(c.f));
    if (hit) {
      mapping[field.key] = hit.h;
      used.add(hit.h);
    }
  }
  // 2.ª pasada: coincidencias parciales para lo que quedó sin relacionar
  for (const field of IMPORT_FIELDS) {
    if (mapping[field.key]) continue;
    const aliases = aliasesOf(field);
    const hit = folded.find((c) => !used.has(c.h) && c.f && aliases.some((a) => a.length >= 4 && (c.f.includes(a) || (c.f.length >= 4 && a.includes(c.f)))));
    if (hit) {
      mapping[field.key] = hit.h;
      used.add(hit.h);
    }
  }
  return mapping;
}

interface Option {
  key: string;
  label: string;
}
export interface ImportContext {
  sources: Option[];
  propertyTypes: Option[];
  districts: Option[];
  users: Array<{ id: string; fullName: string; email: string }>;
  defaultSource: string;
  /** Vendedor por defecto cuando la fila no trae uno ("" = sin asignar). */
  defaultAssignee: string;
}

const findOption = (list: Option[], value: string): Option | undefined => {
  const f = fold(value);
  if (!f) return undefined;
  return list.find((o) => fold(o.label) === f || fold(o.key) === f) ?? list.find((o) => fold(o.label).includes(f) || (f.length >= 4 && f.includes(fold(o.label))));
};

const OPERATIONS: Array<[RegExp, "buy" | "rent" | "sell" | "invest"]> = [
  [/alquil|arrend|rent/, "rent"],
  [/compr|buy|adquir/, "buy"],
  [/vend|sell/, "sell"],
  [/inver|invest/, "invest"],
];
const PRIORITIES: Array<[RegExp, "low" | "medium" | "high" | "urgent"]> = [
  [/urgent/, "urgent"],
  [/alta|high/, "high"],
  [/media|medium|normal/, "medium"],
  [/baja|low/, "low"],
];

/** Interpreta montos como "S/ 450,000", "450000", "US$ 200 mil" o "1.2 M". */
export function parseAmount(raw: string | undefined): { value: number | null; currency: "PEN" | "USD" | null } {
  if (!raw || !raw.trim()) return { value: null, currency: null };
  const s = raw.trim().toLowerCase();
  const currency = /us\$|\$|usd|d[oó]lar/.test(s) ? "USD" : /s\/|pen|sol/.test(s) ? "PEN" : null;
  const m = /(\d[\d.,\s]*)/.exec(s.replace(/s\/|us\$|usd|pen|\$/g, ""));
  if (!m) return { value: null, currency };
  let digits = m[1].replace(/\s/g, "");
  // "450,000" o "450.000" (miles) vs "1.5" (decimal)
  if (/^\d{1,3}([.,]\d{3})+$/.test(digits)) digits = digits.replace(/[.,]/g, "");
  else digits = digits.replace(",", ".");
  let n = Number(digits);
  if (!Number.isFinite(n)) return { value: null, currency };
  if (/\bmil\b|\d\s*k\b/.test(s)) n *= 1000;
  if (/\bmill|\bmm\b|\d\s*m\b/.test(s) && n < 1000) n *= 1_000_000;
  return { value: n, currency };
}

export interface NormalizedRow {
  input: LeadInput | null;
  errors: string[];
  warnings: string[];
}

/** Convierte una fila cruda en un lead válido, con errores (bloquean) y advertencias (se importa igual). */
export function normalizeImportRow(raw: RawImportRow, ctx: ImportContext): NormalizedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (k: ImportFieldKey) => (raw[k] ?? "").toString().trim();

  let source = ctx.defaultSource;
  if (get("source")) {
    const opt = findOption(ctx.sources, get("source"));
    if (opt) source = opt.key;
    else warnings.push(`Fuente «${get("source")}» no reconocida: se usó la fuente por defecto`);
  }

  let operationType = "";
  if (get("operationType")) {
    const f = fold(get("operationType"));
    operationType = OPERATIONS.find(([re]) => re.test(f))?.[1] ?? "";
    if (!operationType) warnings.push(`Operación «${get("operationType")}» no reconocida`);
  }

  let priority: "low" | "medium" | "high" | "urgent" = "medium";
  if (get("priority")) {
    const f = fold(get("priority"));
    const p = PRIORITIES.find(([re]) => re.test(f))?.[1];
    if (p) priority = p;
    else warnings.push(`Prioridad «${get("priority")}» no reconocida: se usó Media`);
  }

  let propertyType = "";
  if (get("propertyType")) {
    const opt = findOption(ctx.propertyTypes, get("propertyType"));
    if (opt) propertyType = opt.key;
    else warnings.push(`Tipo de propiedad «${get("propertyType")}» no reconocido`);
  }

  const districts: string[] = [];
  if (get("districts")) {
    for (const part of get("districts").split(/[,;/|]| y /i).map((p) => p.trim()).filter(Boolean)) {
      const opt = findOption(ctx.districts, part);
      if (opt) {
        if (!districts.includes(opt.key)) districts.push(opt.key);
      } else warnings.push(`Distrito «${part}» no reconocido`);
    }
  }

  const min = parseAmount(raw.budgetMin);
  const max = parseAmount(raw.budgetMax);
  const explicitCurrency = /us|\$|dol/i.test(get("currency")) ? "USD" : /s\/|sol|pen/i.test(get("currency")) ? "PEN" : null;
  const currency = explicitCurrency ?? max.currency ?? min.currency ?? "PEN";
  let budgetMin = min.value;
  let budgetMax = max.value;
  if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) [budgetMin, budgetMax] = [budgetMax, budgetMin];

  let assignedTo = ctx.defaultAssignee;
  if (get("assignedTo")) {
    const f = fold(get("assignedTo"));
    const u = ctx.users.find((x) => x.email.toLowerCase() === get("assignedTo").toLowerCase() || fold(x.fullName) === f) ?? ctx.users.find((x) => f.length >= 3 && fold(x.fullName).includes(f));
    if (u) assignedTo = u.id;
    else warnings.push(`Vendedor «${get("assignedTo")}» no encontrado: queda sin asignar`);
  }

  const candidate = {
    fullName: get("fullName"),
    phone: get("phone"),
    email: get("email").toLowerCase(),
    source,
    priority,
    assignedTo,
    propertyId: "",
    message: get("message").slice(0, 1000),
    interestLevel: "",
    purchaseDate: "",
    tagIds: [] as string[],
    operationType,
    propertyType,
    budgetMin,
    budgetMax,
    currency,
    districts,
    bedroomsMin: null,
    bathroomsMin: null,
    areaMin: null,
    areaMax: null,
    financing: "",
  };

  const parsed = leadSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(issue.message);
    return { input: null, errors: [...new Set(errors)], warnings };
  }
  return { input: parsed.data, errors, warnings };
}

/** Clave para detectar repetidos dentro del mismo archivo. */
export function dedupeKeys(input: Pick<LeadInput, "phone" | "email">, normalizePhone: (p: string | null | undefined) => string | null): string[] {
  const keys: string[] = [];
  const p = normalizePhone(input.phone);
  if (p) keys.push(`p:${p}`);
  if (input.email?.trim()) keys.push(`e:${input.email.trim().toLowerCase()}`);
  return keys;
}
