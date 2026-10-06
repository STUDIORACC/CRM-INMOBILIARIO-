import { LEAD_STAGES, OPERATION_TYPES, PRIORITIES, PROPERTY_OPERATIONS, PROPERTY_STATUSES, PUBLICATION_STATUSES, ROLES, TASK_KINDS, TASK_STATUSES, VISIT_OUTCOMES, VISIT_STATUSES, labelOf, type Opt } from "./constants";
import { fmtDateTime } from "./dates";
import { formatMoney } from "./money";

/** Nombres legibles de las columnas que aparecen en la auditoría. */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  full_name: "Nombre",
  first_name: "Nombres",
  last_name: "Apellidos",
  phone: "Teléfono",
  phone_secondary: "Teléfono secundario",
  email: "Email",
  document_type: "Tipo de documento",
  document_number: "N.º de documento",
  source: "Fuente",
  stage: "Etapa",
  status: "Estado",
  priority: "Prioridad",
  assigned_to: "Responsable",
  advisor_id: "Asesor",
  created_by: "Creado por",
  owner_id: "Propietario",
  lead_id: "Lead",
  client_id: "Cliente",
  property_id: "Propiedad",
  opportunity_id: "Oportunidad",
  operation: "Operación",
  property_type: "Tipo de propiedad",
  district: "Distrito",
  districts: "Distritos",
  address: "Dirección",
  title: "Título",
  description: "Descripción",
  code: "Código",
  price: "Precio",
  currency: "Moneda",
  budget_min: "Presupuesto mínimo",
  budget_max: "Presupuesto máximo",
  value: "Valor",
  commission_pct: "Comisión (%)",
  probability: "Probabilidad",
  expected_close_date: "Cierre estimado",
  bedrooms: "Dormitorios",
  bathrooms: "Baños",
  area_built: "Área construida",
  area_total: "Área total",
  parking: "Cocheras",
  publication_status: "Publicación",
  loss_reason: "Motivo de pérdida",
  loss_notes: "Detalle de pérdida",
  lost_reason: "Motivo de pérdida",
  due_at: "Vence",
  kind: "Tipo",
  scheduled_at: "Fecha y hora",
  duration_min: "Duración (min)",
  outcome: "Resultado",
  cancel_reason: "Motivo de cancelación",
  role: "Rol",
  active: "Activo",
  label: "Etiqueta",
  key: "Clave",
  color: "Color",
  sort_order: "Orden",
  name: "Nombre",
  legal_name: "Razón social",
  tax_id: "RUC",
  timezone: "Zona horaria",
  exchange_rate: "Tipo de cambio",
  notes: "Notas",
  won_at: "Cerrada el",
  lost_at: "Perdida el",
  closed_at: "Cierre",
  finance_status: "Financiamiento",
  financing: "Financiamiento",
  completed_at: "Completada el",
  deleted_at: "Eliminado",
};

export function auditFieldLabel(key: string): string {
  if (AUDIT_FIELD_LABELS[key]) return AUDIT_FIELD_LABELS[key];
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Funciones de resolución de etiquetas que aporta el cliente (catálogos y usuarios). */
export interface AuditCtx {
  userName: (id: string | null | undefined) => string;
  stageLabel: (k: string | null | undefined) => string;
  source: (k: string | null | undefined) => string;
  district: (k: string | null | undefined) => string;
  propertyType: (k: string | null | undefined) => string;
  lossReason: (k: string | null | undefined) => string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const USER_FIELDS = new Set(["assigned_to", "advisor_id", "created_by", "user_id", "changed_by"]);
const MONEY_FIELDS = new Set(["price", "budget_min", "budget_max", "value", "commission_amount", "expected_value"]);

function statusList(entity: string): ReadonlyArray<Opt> {
  if (entity === "properties") return PROPERTY_STATUSES;
  if (entity === "visits") return VISIT_STATUSES;
  if (entity === "tasks") return TASK_STATUSES;
  return [];
}

export function formatAuditValue(field: string, value: unknown, entity: string, ctx: AuditCtx, currency?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.length ? value.map((v) => formatAuditValue(field, v, entity, ctx)).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") {
    if (UUID.test(value)) return USER_FIELDS.has(field) ? ctx.userName(value) : "Registro vinculado";
    if (ISO.test(value)) return fmtDateTime(value);
    switch (field) {
      case "stage":
        return entity === "leads" ? (labelOf(LEAD_STAGES, value) !== value ? labelOf(LEAD_STAGES, value) : ctx.stageLabel(value)) : ctx.stageLabel(value);
      case "status": {
        const list = statusList(entity);
        return list.length ? labelOf(list, value) : value;
      }
      case "priority":
        return labelOf(PRIORITIES, value);
      case "source":
        return ctx.source(value);
      case "district":
        return ctx.district(value);
      case "property_type":
        return ctx.propertyType(value);
      case "loss_reason":
      case "lost_reason":
        return ctx.lossReason(value);
      case "operation":
        return labelOf(entity === "properties" ? PROPERTY_OPERATIONS : OPERATION_TYPES, value);
      case "publication_status":
        return labelOf(PUBLICATION_STATUSES, value);
      case "role":
        return labelOf(ROLES, value);
      case "kind":
        return labelOf(TASK_KINDS, value);
      case "outcome":
        return labelOf(VISIT_OUTCOMES, value);
      default:
        return value;
    }
  }
  if (typeof value === "number") {
    if (MONEY_FIELDS.has(field)) return formatMoney(value, (currency as "PEN" | "USD") ?? "PEN");
    return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(value);
  }
  return String(value);
}

export interface ChangeLine {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** Convierte el JSON de cambios en líneas legibles (solo para eventos de edición). */
export function describeChanges(changes: unknown, entity: string, ctx: AuditCtx): ChangeLine[] {
  if (!changes || typeof changes !== "object" || "snapshot" in (changes as object)) return [];
  const currency = (changes as Record<string, { to?: unknown }>).currency?.to as string | undefined;
  return Object.entries(changes as Record<string, { from: unknown; to: unknown }>)
    .filter(([, v]) => v && typeof v === "object" && "from" in v && "to" in v)
    .map(([field, v]) => ({
      field,
      label: auditFieldLabel(field),
      from: formatAuditValue(field, v.from, entity, ctx, currency),
      to: formatAuditValue(field, v.to, entity, ctx, currency),
    }));
}

/** Datos de un registro eliminado (snapshot), como pares legibles. */
export function describeSnapshot(changes: unknown, entity: string, ctx: AuditCtx): Array<{ label: string; value: string }> {
  const snap = changes && typeof changes === "object" && "snapshot" in (changes as object) ? ((changes as { snapshot: Record<string, unknown> }).snapshot ?? {}) : null;
  if (!snap) return [];
  const hide = new Set(["id", "created_at", "updated_at", "phone_normalized", "email_normalized"]);
  return Object.entries(snap)
    .filter(([k, v]) => !hide.has(k) && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .slice(0, 24)
    .map(([k, v]) => ({ label: auditFieldLabel(k), value: formatAuditValue(k, v, entity, ctx) }));
}
