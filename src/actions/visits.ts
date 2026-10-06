"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { cancelVisit, completeVisit, confirmVisit, createVisit, deleteVisit, rescheduleVisit } from "@/lib/services/visits";
import { cancelVisitSchema, completeVisitSchema, visitSchema } from "@/lib/validation/visits";

export const createVisitAction = defineAction({
  schema: visitSchema,
  successMessage: "Visita agendada",
  handler: async ({ session, db }, input) => createVisit(db, session, input),
});

export const rescheduleVisitAction = defineAction({
  schema: visitSchema.safeExtend({ visitId: z.string().uuid() }),
  successMessage: "Visita reprogramada",
  handler: async ({ session, db }, input) => {
    const { visitId, ...rest } = input;
    return rescheduleVisit(db, session, visitId, rest);
  },
});

export const confirmVisitAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  successMessage: "Visita confirmada",
  handler: async ({ session, db }, input) => {
    await confirmVisit(db, session, input.id);
  },
});

export const completeVisitAction = defineAction({
  schema: completeVisitSchema,
  successMessage: "Resultado registrado",
  handler: async ({ session, db }, input) => completeVisit(db, session, input),
});

export const cancelVisitAction = defineAction({
  schema: cancelVisitSchema,
  handler: async ({ session, db }, input) => {
    await cancelVisit(db, session, input.id, input.mode, input.reason?.trim() || null);
    return { mode: input.mode };
  },
  successMessage: (r) => (r.mode === "no_show" ? "Registrado: el cliente no asistió" : "Visita cancelada"),
});

export const deleteVisitAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  capability: "leads.delete",
  successMessage: "Visita eliminada",
  handler: async ({ db }, input) => {
    await deleteVisit(db, input.id);
  },
});
