import { z } from "zod";
import { dateOnly, optionalAmount, optionalInt, optionalText, optionalUuid, priorityEnum, currencyEnum, requiredUuid } from "./common";

export const optEnum = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.enum(values), z.literal("")]).optional();

const phoneField = z
  .string()
  .trim()
  .max(30, "Teléfono demasiado largo")
  .refine((v) => v === "" || (v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15), "Ingresa un teléfono válido (7 a 15 dígitos)")
  .optional();

const emailField = z
  .string()
  .trim()
  .max(120)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Correo electrónico inválido")
  .optional();

export const OPERATION_VALUES = ["buy", "rent", "sell", "invest"] as const;
export const FINANCING_VALUES = ["cash", "mortgage", "undecided"] as const;
export const INTEREST_VALUES = ["low", "medium", "high", "urgent"] as const;
export const STAGE_VALUES = ["new", "contacted", "qualified", "opportunity", "visit", "negotiation", "won", "lost"] as const;

/** Preferencias de búsqueda: compartidas por leads y clientes (alimentan el matching). */
export const searchProfileShape = {
  operationType: optEnum(OPERATION_VALUES),
  propertyType: optionalText(40),
  budgetMin: optionalAmount,
  budgetMax: optionalAmount,
  currency: currencyEnum,
  districts: z.array(z.string()).max(12, "Máximo 12 distritos"),
  bedroomsMin: optionalInt(0, 20),
  bathroomsMin: optionalInt(0, 20),
  areaMin: optionalAmount,
  areaMax: optionalAmount,
  financing: optEnum(FINANCING_VALUES),
};

type ProfileLike = { budgetMin?: number | null; budgetMax?: number | null; areaMin?: number | null; areaMax?: number | null };
export function refineProfile<T extends ProfileLike>(v: T, ctx: z.RefinementCtx) {
  if (v.budgetMin != null && v.budgetMax != null && v.budgetMin > v.budgetMax) {
    ctx.addIssue({ code: "custom", path: ["budgetMax"], message: "El máximo debe ser mayor o igual al mínimo" });
  }
  if (v.areaMin != null && v.areaMax != null && v.areaMin > v.areaMax) {
    ctx.addIssue({ code: "custom", path: ["areaMax"], message: "El máximo debe ser mayor o igual al mínimo" });
  }
}

export const leadSchema = z
  .object({
    fullName: z.string().trim().min(2, "Ingresa el nombre del lead").max(120, "Máximo 120 caracteres"),
    phone: phoneField,
    email: emailField,
    source: z.string().min(1, "Selecciona la fuente"),
    priority: priorityEnum,
    assignedTo: optionalUuid,
    propertyId: optionalUuid,
    message: optionalText(1000),
    interestLevel: optEnum(INTEREST_VALUES),
    purchaseDate: z.union([dateOnly, z.literal("")]).optional(),
    tagIds: z.array(z.string().uuid()).max(12),
    ...searchProfileShape,
  })
  .superRefine((v, ctx) => {
    if (!(v.phone ?? "").trim() && !(v.email ?? "").trim()) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Ingresa un teléfono o un correo" });
    }
    refineProfile(v, ctx);
  });
export type LeadInput = z.infer<typeof leadSchema>;

export const duplicateModeSchema = z.union([z.literal("check"), z.literal("create"), z.string().regex(/^merge:(lead|client):[0-9a-f-]{36}$/)]);

export const createLeadSchema = z.object({ lead: leadSchema, duplicateMode: duplicateModeSchema.default("check") });
export const updateLeadSchema = z.object({ id: z.string().uuid(), lead: leadSchema });

export const assignSchema = z.object({
  entity: z.enum(["lead", "client", "opportunity", "property"]),
  ids: z.array(z.string().uuid()).min(1).max(500),
  userId: requiredUuid("Selecciona un vendedor"),
  moveOpenWork: z.boolean().optional(),
});

export const lostSchema = z.object({
  entity: z.enum(["lead", "opportunity"]),
  id: z.string().uuid(),
  reason: z.string().min(1, "Selecciona el motivo de pérdida"),
  notes: optionalText(500),
  alsoLead: z.boolean().optional(),
});

export const stageSchema = z.object({ id: z.string().uuid(), stage: z.enum(["new", "contacted", "qualified", "opportunity", "visit", "negotiation"]) });
export const prioritySchema = z.object({ entity: z.enum(["lead", "opportunity"]), id: z.string().uuid(), priority: priorityEnum });
export const tagsSchema = z.object({ entity: z.enum(["lead", "client"]), id: z.string().uuid(), tagIds: z.array(z.string().uuid()).max(12) });
export const mergeSchema = z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid() });

export const ACTIVITY_INPUT_TYPES = ["call", "whatsapp", "email", "meeting", "follow_up", "note"] as const;
export const activitySchema = z
  .object({
    type: z.enum(ACTIVITY_INPUT_TYPES, { error: "Selecciona el tipo de actividad" }),
    title: optionalText(160),
    body: optionalText(2000),
    direction: z.enum(["outbound", "inbound"]),
    responded: z.boolean().optional(),
    leadId: optionalUuid,
    clientId: optionalUuid,
    opportunityId: optionalUuid,
    propertyId: optionalUuid,
    ownerId: optionalUuid,
    followUpAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha inválida"), z.literal("")]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "note" && !(v.body ?? "").trim()) ctx.addIssue({ code: "custom", path: ["body"], message: "Escribe la nota" });
    if (!v.leadId && !v.clientId && !v.opportunityId && !v.propertyId && !v.ownerId) {
      ctx.addIssue({ code: "custom", path: ["leadId"], message: "Vincula la actividad a un lead, cliente, oportunidad o propiedad" });
    }
  });
export type ActivityInput = z.infer<typeof activitySchema>;

const multi = z
  .string()
  .optional()
  .catch(undefined)
  .transform((v) => (v ? v.split(",").filter(Boolean) : []));

export const leadListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  stage: multi,
  priority: multi,
  source: multi,
  temp: multi,
  tag: multi,
  assigned: z.string().optional().catch(undefined),
  district: z.string().optional().catch(undefined),
  operation: z.string().optional().catch(undefined),
  type: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  alert: z.enum(["uncontacted", "idle", "overdue_follow_up", "hot_no_followup", "unassigned", "upcoming_visit"]).optional().catch(undefined),
  sort: z.enum(["created_at", "full_name", "score", "last_activity_at", "next_follow_up_at", "priority", "stage"]).catch("created_at"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(20),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
