/**
 * Valores controlados del dominio con su etiqueta y tono visual.
 * Las claves coinciden con los CHECK constraints de la base de datos.
 */

export type Tone =
  | "slate"
  | "blue"
  | "sky"
  | "indigo"
  | "violet"
  | "amber"
  | "orange"
  | "pink"
  | "teal"
  | "emerald"
  | "rose";

export interface Opt<T extends string = string> {
  value: T;
  label: string;
  tone: Tone;
}

const opts = <T extends string>(list: Array<[T, string, Tone]>): Opt<T>[] =>
  list.map(([value, label, tone]) => ({ value, label, tone }));

export function labelOf<T extends string>(list: ReadonlyArray<Opt<T>>, value: string | null | undefined): string {
  if (!value) return "—";
  return list.find((o) => o.value === value)?.label ?? value;
}

export function toneOf<T extends string>(list: ReadonlyArray<Opt<T>>, value: string | null | undefined): Tone {
  return list.find((o) => o.value === value)?.tone ?? "slate";
}

// --- Roles -------------------------------------------------------------------
export type Role = "admin" | "manager" | "advisor" | "assistant";
export const ROLES = opts<Role>([
  ["admin", "Administrador", "violet"],
  ["manager", "Gerente", "indigo"],
  ["advisor", "Asesor", "blue"],
  ["assistant", "Asistente", "slate"],
]);

// --- Leads -------------------------------------------------------------------
export type LeadStage = "new" | "contacted" | "qualified" | "opportunity" | "visit" | "negotiation" | "won" | "lost";
export const LEAD_STAGES = opts<LeadStage>([
  ["new", "Nuevo", "slate"],
  ["contacted", "Contactado", "blue"],
  ["qualified", "Calificado", "indigo"],
  ["opportunity", "Oportunidad", "violet"],
  ["visit", "Visita", "amber"],
  ["negotiation", "Negociación", "pink"],
  ["won", "Cierre", "emerald"],
  ["lost", "Perdido", "rose"],
]);
export const LEAD_STAGE_ORDER: LeadStage[] = LEAD_STAGES.map((s) => s.value);

export type Priority = "low" | "medium" | "high" | "urgent";
export const PRIORITIES = opts<Priority>([
  ["low", "Baja", "slate"],
  ["medium", "Media", "blue"],
  ["high", "Alta", "amber"],
  ["urgent", "Urgente", "rose"],
]);

export type OperationType = "buy" | "rent" | "sell" | "invest";
export const OPERATION_TYPES = opts<OperationType>([
  ["buy", "Compra", "indigo"],
  ["rent", "Alquiler", "teal"],
  ["sell", "Venta", "amber"],
  ["invest", "Inversión", "violet"],
]);

export type Financing = "cash" | "mortgage" | "undecided";
export const FINANCING = opts<Financing>([
  ["cash", "Efectivo", "emerald"],
  ["mortgage", "Crédito hipotecario", "blue"],
  ["undecided", "Por evaluar", "slate"],
]);

export type InterestLevel = "low" | "medium" | "high" | "urgent";
export const INTEREST_LEVELS = opts<InterestLevel>([
  ["low", "Bajo", "slate"],
  ["medium", "Medio", "blue"],
  ["high", "Alto", "amber"],
  ["urgent", "Urgente", "rose"],
]);

export type Temperature = "cold" | "warm" | "hot" | "very_hot";
export const TEMPERATURES = opts<Temperature>([
  ["cold", "Frío", "sky"],
  ["warm", "Tibio", "amber"],
  ["hot", "Caliente", "orange"],
  ["very_hot", "Muy caliente", "rose"],
]);

// --- Propiedades -------------------------------------------------------------
export type PropertyOperation = "sale" | "rent";
export const PROPERTY_OPERATIONS = opts<PropertyOperation>([
  ["sale", "Venta", "indigo"],
  ["rent", "Alquiler", "teal"],
]);

export type PropertyStatus = "available" | "reserved" | "sold" | "rented" | "paused" | "withdrawn";
export const PROPERTY_STATUSES = opts<PropertyStatus>([
  ["available", "Disponible", "emerald"],
  ["reserved", "Reservado", "amber"],
  ["sold", "Vendido", "indigo"],
  ["rented", "Alquilado", "violet"],
  ["paused", "Pausado", "orange"],
  ["withdrawn", "Retirado", "slate"],
]);

export type PublicationStatus = "published" | "pending" | "paused" | "withdrawn";
export const PUBLICATION_STATUSES = opts<PublicationStatus>([
  ["published", "Publicada", "emerald"],
  ["pending", "Pendiente", "amber"],
  ["paused", "Pausada", "orange"],
  ["withdrawn", "Retirada", "slate"],
]);

export type Currency = "PEN" | "USD";
export const CURRENCIES = opts<Currency>([
  ["PEN", "Soles (S/)", "slate"],
  ["USD", "Dólares (US$)", "slate"],
]);
export const CURRENCY_SYMBOL: Record<Currency, string> = { PEN: "S/", USD: "US$" };

export const PROPERTY_FEATURES: Array<{ value: string; label: string }> = [
  { value: "balcony", label: "Balcón" },
  { value: "terrace", label: "Terraza" },
  { value: "garden", label: "Jardín" },
  { value: "pool", label: "Piscina" },
  { value: "security", label: "Seguridad 24 h" },
  { value: "laundry", label: "Lavandería" },
  { value: "storage", label: "Depósito" },
  { value: "exterior_view", label: "Vista exterior" },
  { value: "pets", label: "Acepta mascotas" },
  { value: "gym", label: "Gimnasio" },
  { value: "bbq", label: "Zona de parrilla" },
  { value: "playground", label: "Área de juegos" },
  { value: "coworking", label: "Coworking" },
  { value: "rooftop", label: "Terraza común" },
];

// --- Oportunidades -----------------------------------------------------------
export const PROBABILITIES = [10, 25, 50, 75, 90, 100] as const;

// --- Visitas -----------------------------------------------------------------
export type VisitStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show" | "rescheduled";
export const VISIT_STATUSES = opts<VisitStatus>([
  ["scheduled", "Programada", "blue"],
  ["confirmed", "Confirmada", "emerald"],
  ["completed", "Realizada", "slate"],
  ["cancelled", "Cancelada", "rose"],
  ["no_show", "No asistió", "orange"],
  ["rescheduled", "Reprogramada", "violet"],
]);
export const ACTIVE_VISIT_STATUSES: VisitStatus[] = ["scheduled", "confirmed"];

export type VisitOutcome = "interested" | "very_interested" | "needs_time" | "not_interested" | "wants_other";
export const VISIT_OUTCOMES = opts<VisitOutcome>([
  ["very_interested", "Muy interesado", "emerald"],
  ["interested", "Interesado", "teal"],
  ["needs_time", "Necesita pensarlo", "amber"],
  ["wants_other", "Desea otra propiedad", "violet"],
  ["not_interested", "No interesado", "rose"],
]);

// --- Tareas ------------------------------------------------------------------
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export const TASK_STATUSES = opts<TaskStatus | "overdue">([
  ["pending", "Pendiente", "blue"],
  ["in_progress", "En progreso", "amber"],
  ["completed", "Completada", "emerald"],
  ["cancelled", "Cancelada", "slate"],
  ["overdue", "Vencida", "rose"],
]);

export type TaskKind = "call" | "whatsapp" | "meeting" | "visit" | "send_properties" | "follow_up" | "document" | "other";
export const TASK_KINDS = opts<TaskKind>([
  ["call", "Llamar", "blue"],
  ["whatsapp", "WhatsApp", "emerald"],
  ["meeting", "Reunión", "violet"],
  ["visit", "Visita", "amber"],
  ["send_properties", "Enviar propiedades", "indigo"],
  ["follow_up", "Seguimiento", "teal"],
  ["document", "Documentación", "slate"],
  ["other", "Otra", "slate"],
]);

// --- Actividades -------------------------------------------------------------
export type ActivityType = "call" | "whatsapp" | "email" | "visit" | "meeting" | "note" | "task" | "follow_up" | "system";
export const ACTIVITY_TYPES = opts<ActivityType>([
  ["call", "Llamada", "blue"],
  ["whatsapp", "WhatsApp", "emerald"],
  ["email", "Email", "indigo"],
  ["visit", "Visita", "amber"],
  ["meeting", "Reunión", "violet"],
  ["note", "Nota", "slate"],
  ["task", "Tarea", "teal"],
  ["follow_up", "Seguimiento", "pink"],
  ["system", "Sistema", "slate"],
]);
/** Tipos que el usuario puede registrar manualmente. */
export const MANUAL_ACTIVITY_TYPES: ActivityType[] = ["call", "whatsapp", "email", "meeting", "follow_up", "note"];

// --- Auditoría ---------------------------------------------------------------
export const AUDIT_EVENTS = opts<string>([
  ["create", "Creación", "emerald"],
  ["update", "Edición", "blue"],
  ["delete", "Eliminación", "rose"],
  ["stage_change", "Cambio de etapa", "violet"],
  ["assignment", "Asignación", "indigo"],
  ["price_change", "Cambio de precio", "amber"],
  ["status_change", "Cambio de estado", "orange"],
]);

export const AUDIT_ENTITIES: Array<{ value: string; label: string; href?: (id: string) => string }> = [
  { value: "leads", label: "Lead", href: (id) => `/leads/${id}` },
  { value: "clients", label: "Cliente", href: (id) => `/clients/${id}` },
  { value: "owners", label: "Propietario", href: (id) => `/owners/${id}` },
  { value: "properties", label: "Propiedad", href: (id) => `/properties/${id}` },
  { value: "opportunities", label: "Oportunidad", href: (id) => `/opportunities/${id}` },
  { value: "visits", label: "Visita" },
  { value: "tasks", label: "Tarea" },
  { value: "users", label: "Usuario" },
  { value: "company_settings", label: "Configuración" },
  { value: "catalog_items", label: "Catálogo" },
  { value: "pipeline_stages", label: "Etapa del pipeline" },
];

// --- Propietarios / documentos ------------------------------------------------
export const DOC_TYPES = opts<"dni" | "ruc" | "ce" | "passport">([
  ["dni", "DNI", "slate"],
  ["ruc", "RUC", "slate"],
  ["ce", "Carné de extranjería", "slate"],
  ["passport", "Pasaporte", "slate"],
]);

export const OWNER_TYPES = opts<"individual" | "company" | "joint">([
  ["individual", "Persona natural", "blue"],
  ["company", "Empresa", "violet"],
  ["joint", "Copropietarios", "teal"],
]);

export type DocumentCategory = "identity" | "contract" | "deed" | "plans" | "valuation" | "financing" | "other";
export const DOCUMENT_CATEGORIES = opts<DocumentCategory>([
  ["identity", "Identidad", "slate"],
  ["contract", "Contrato", "indigo"],
  ["deed", "Escritura / título", "violet"],
  ["plans", "Planos", "teal"],
  ["valuation", "Tasación", "amber"],
  ["financing", "Financiamiento", "blue"],
  ["other", "Otro", "slate"],
]);

// --- Notificaciones ----------------------------------------------------------
export const NOTIFICATION_SETTINGS = [
  { key: "new_lead_assigned", label: "Nuevo lead asignado" },
  { key: "follow_up_overdue", label: "Seguimiento vencido" },
  { key: "visit_upcoming", label: "Visita próxima" },
  { key: "visit_cancelled", label: "Visita cancelada" },
  { key: "opportunity_stalled", label: "Oportunidad sin actividad" },
  { key: "task_overdue", label: "Tarea vencida" },
  { key: "property_reserved", label: "Propiedad reservada" },
  { key: "new_client", label: "Nuevo cliente" },
  { key: "new_opportunity", label: "Nueva oportunidad" },
] as const;
export type NotificationKey = (typeof NOTIFICATION_SETTINGS)[number]["key"];

// --- Marcadores de plantillas de mensajes ------------------------------------
export const TEMPLATE_VARIABLES = [
  { key: "nombre", label: "Nombre del cliente" },
  { key: "asesor", label: "Nombre del asesor" },
  { key: "empresa", label: "Nombre de la empresa" },
  { key: "propiedad", label: "Título de la propiedad" },
  { key: "codigo", label: "Código de la propiedad" },
  { key: "precio", label: "Precio de la propiedad" },
  { key: "direccion", label: "Dirección / distrito" },
  { key: "fecha", label: "Fecha de la visita" },
  { key: "hora", label: "Hora de la visita" },
] as const;

export const TEMPLATE_CATEGORIES = opts<string>([
  ["first_contact", "Primer contacto", "blue"],
  ["send_properties", "Envío de propiedades", "indigo"],
  ["confirm_visit", "Confirmar visita", "emerald"],
  ["remind_visit", "Recordatorio de visita", "amber"],
  ["post_visit", "Post visita", "teal"],
  ["follow_up", "Seguimiento", "pink"],
  ["reactivation", "Reactivación", "violet"],
  ["general", "General", "slate"],
]);

// --- Tonos -> clases ---------------------------------------------------------
export const TONE_CLASSES: Record<Tone, { badge: string; dot: string; soft: string; text: string }> = {
  slate: { badge: "bg-slate-100 text-slate-700 ring-slate-500/20", dot: "bg-slate-400", soft: "bg-slate-50", text: "text-slate-600" },
  blue: { badge: "bg-blue-50 text-blue-700 ring-blue-600/20", dot: "bg-blue-500", soft: "bg-blue-50", text: "text-blue-600" },
  sky: { badge: "bg-sky-50 text-sky-700 ring-sky-600/20", dot: "bg-sky-500", soft: "bg-sky-50", text: "text-sky-600" },
  indigo: { badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/20", dot: "bg-indigo-500", soft: "bg-indigo-50", text: "text-indigo-600" },
  violet: { badge: "bg-violet-50 text-violet-700 ring-violet-600/20", dot: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-600" },
  amber: { badge: "bg-amber-50 text-amber-800 ring-amber-600/25", dot: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-600" },
  orange: { badge: "bg-orange-50 text-orange-700 ring-orange-600/20", dot: "bg-orange-500", soft: "bg-orange-50", text: "text-orange-600" },
  pink: { badge: "bg-pink-50 text-pink-700 ring-pink-600/20", dot: "bg-pink-500", soft: "bg-pink-50", text: "text-pink-600" },
  teal: { badge: "bg-teal-50 text-teal-700 ring-teal-600/20", dot: "bg-teal-500", soft: "bg-teal-50", text: "text-teal-600" },
  emerald: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-600" },
  rose: { badge: "bg-rose-50 text-rose-700 ring-rose-600/20", dot: "bg-rose-500", soft: "bg-rose-50", text: "text-rose-600" },
};
