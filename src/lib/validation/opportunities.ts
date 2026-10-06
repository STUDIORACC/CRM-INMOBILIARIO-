import { z } from "zod";
import { currencyEnum, dateOnly, optionalText, optionalUuid, priorityEnum, requiredUuid } from "./common";

export const PROBABILITY_VALUES = [10, 25, 50, 75, 90] as const;
export const probabilitySchema = z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(75), z.literal(90)], { error: "Selecciona una probabilidad" });

export const opportunitySchema = z
  .object({
    leadId: optionalUuid,
    clientId: optionalUuid,
    propertyId: requiredUuid("Selecciona la propiedad"),
    assignedTo: requiredUuid("Selecciona el vendedor responsable"),
    stage: z.string().min(1, "Selecciona la etapa"),
    value: z.number({ error: "Ingresa el valor estimado" }).min(1, "El valor debe ser mayor a 0").max(1_000_000_000, "Valor demasiado alto").nullable(),
    currency: currencyEnum,
    probability: probabilitySchema,
    priority: priorityEnum,
    expectedCloseDate: z.union([dateOnly, z.literal("")]).optional(),
    nextStep: optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (!v.leadId && !v.clientId) ctx.addIssue({ code: "custom", path: ["leadId"], message: "Selecciona un lead o un cliente" });
    if (v.value == null) ctx.addIssue({ code: "custom", path: ["value"], message: "Ingresa el valor estimado" });
  });
export type OpportunityInput = z.infer<typeof opportunitySchema>;

export const updateOpportunitySchema = z.object({
  id: z.string().uuid(),
  value: z.number().min(1, "El valor debe ser mayor a 0").max(1_000_000_000).nullable(),
  probability: probabilitySchema,
  priority: priorityEnum,
  expectedCloseDate: z.union([dateOnly, z.literal("")]).optional(),
  nextStep: optionalText(200),
  assignedTo: optionalUuid,
});

export const moveOpportunitySchema = z.object({ id: z.string().uuid(), stage: z.string().min(1) });

export const winOpportunitySchema = z.object({
  id: z.string().uuid(),
  value: z.number({ error: "Ingresa el valor final de la operación" }).min(1, "El valor debe ser mayor a 0").max(1_000_000_000).nullable(),
  notes: optionalText(500),
});

export const loseOpportunitySchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1, "Selecciona el motivo de pérdida"),
  notes: optionalText(500),
  alsoLead: z.boolean().optional(),
});

export const opportunityListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  view: z.enum(["board", "table"]).catch("board"),
  stage: z.string().optional().catch(undefined),
  advisor: z.string().optional().catch(undefined),
  priority: z.string().optional().catch(undefined),
  operation: z.string().optional().catch(undefined),
  stalled: z.string().optional().catch(undefined),
  closed: z.enum(["recent", "none"]).catch("recent"),
  sort: z.enum(["updated_at", "value", "expected_close_date", "stage_changed_at", "probability"]).catch("updated_at"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(25),
});
export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;
