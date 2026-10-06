import { z } from "zod";
import { dateTimeLocal, optionalText, optionalUuid, requiredUuid } from "./common";

export const VISIT_OUTCOME_VALUES = ["interested", "very_interested", "needs_time", "not_interested", "wants_other"] as const;

export const visitSchema = z
  .object({
    leadId: optionalUuid,
    clientId: optionalUuid,
    propertyId: requiredUuid("Selecciona la propiedad a visitar"),
    opportunityId: optionalUuid,
    advisorId: requiredUuid("Selecciona el asesor que atenderá la visita"),
    scheduledAt: dateTimeLocal,
    durationMin: z.number({ error: "Selecciona la duración" }).int().min(10).max(480),
    observations: optionalText(500),
    /** Programar aunque el asesor tenga otra visita en ese horario. */
    force: z.boolean().optional(),
    /** Si reprograma otra visita, su id. */
    rescheduleOf: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (!v.leadId && !v.clientId) ctx.addIssue({ code: "custom", path: ["leadId"], message: "Selecciona un lead o un cliente" });
  });
export type VisitInput = z.infer<typeof visitSchema>;

export const completeVisitSchema = z.object({
  id: z.string().uuid(),
  outcome: z.enum(VISIT_OUTCOME_VALUES, { error: "Selecciona el resultado de la visita" }),
  notes: z.string().trim().min(5, "Escribe una breve nota del asesor (mín. 5 caracteres)").max(1000, "Máximo 1000 caracteres"),
  followUp: z.boolean().optional(),
  followUpAt: z.union([dateTimeLocal, z.literal("")]).optional(),
});
export type CompleteVisitInput = z.infer<typeof completeVisitSchema>;

export const cancelVisitSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(["cancelled", "no_show"]),
  reason: optionalText(300),
});

export const visitListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  advisor: z.string().optional().catch(undefined),
  range: z.enum(["today", "tomorrow", "week", "upcoming", "past", "all"]).catch("upcoming"),
  pending: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  view: z.enum(["agenda", "table"]).catch("agenda"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(30),
});
export type VisitListQuery = z.infer<typeof visitListQuerySchema>;
