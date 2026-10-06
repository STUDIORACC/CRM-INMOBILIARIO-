"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { loadLabelFns } from "@/lib/services/catalogs";
import { createOpportunity, deleteOpportunity, loseOpportunity, moveOpportunity, updateOpportunity, winOpportunity } from "@/lib/services/opportunities";
import { loseOpportunitySchema, moveOpportunitySchema, opportunitySchema, updateOpportunitySchema, winOpportunitySchema } from "@/lib/validation/opportunities";

export const createOpportunityAction = defineAction({
  schema: opportunitySchema,
  capability: "opportunities.access",
  successMessage: "Oportunidad creada",
  handler: async ({ session, db }, input) => createOpportunity(db, session, input),
});

export const updateOpportunityAction = defineAction({
  schema: updateOpportunitySchema,
  capability: "opportunities.access",
  successMessage: "Oportunidad actualizada",
  handler: async ({ session, db }, input) => {
    await updateOpportunity(db, session, { ...input, value: input.value });
  },
});

export const moveOpportunityAction = defineAction({
  schema: moveOpportunitySchema,
  capability: "opportunities.access",
  handler: async ({ session, db }, input) => moveOpportunity(db, session, input.id, input.stage),
  successMessage: "Etapa actualizada",
});

export const winOpportunityAction = defineAction({
  schema: winOpportunitySchema,
  capability: "opportunities.access",
  successMessage: "¡Operación cerrada! 🎉",
  handler: async ({ session, db }, input) => winOpportunity(db, session, input.id, input.value as number, input.notes?.trim() || null),
});

export const markOpportunityLostAction = defineAction({
  schema: loseOpportunitySchema,
  capability: "opportunities.access",
  successMessage: "Oportunidad marcada como perdida",
  handler: async ({ session, db }, input) => {
    const labels = await loadLabelFns(db);
    await loseOpportunity(db, session, input.id, input.reason, input.notes?.trim() || null, Boolean(input.alsoLead), labels.lossReason);
  },
});

export const deleteOpportunityAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  capability: "opportunities.delete",
  successMessage: "Oportunidad eliminada",
  handler: async ({ db }, input) => {
    await deleteOpportunity(db, input.id);
  },
});
