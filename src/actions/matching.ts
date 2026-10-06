"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { AppError } from "@/lib/errors";
import { matchForClient, matchForLead, matchForProperty, saveMatch } from "@/lib/services/matching";

export const getMatchesAction = defineAction({
  schema: z.object({ leadId: z.string().uuid().optional(), clientId: z.string().uuid().optional(), limit: z.number().int().min(1).max(30).optional() }),
  handler: async ({ db }, input) => {
    if (input.leadId) return matchForLead(db, input.leadId, input.limit);
    if (input.clientId) return matchForClient(db, input.clientId, input.limit);
    throw new AppError("Indica un lead o cliente.");
  },
});

export const getInterestedPartiesAction = defineAction({
  schema: z.object({ propertyId: z.string().uuid() }),
  handler: async ({ db }, input) => matchForProperty(db, input.propertyId),
});

const reasonSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(["match", "partial", "miss"]),
  detail: z.string(),
  weight: z.number(),
});

export const saveMatchAction = defineAction({
  schema: z.object({
    propertyId: z.string().uuid(),
    leadId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    status: z.enum(["suggested", "sent", "visit_scheduled", "discarded"]),
    score: z.number().int().min(0).max(100),
    reasons: z.array(reasonSchema),
  }),
  handler: async ({ session, db }, input) => {
    await saveMatch(db, session, { ...input, reasons: input.reasons as never });
  },
  successMessage: "Listo",
});
