"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { logActivity, deleteNote, setNotePinned, updateNote } from "@/lib/services/activities";
import { loadLabelFns } from "@/lib/services/catalogs";
import {
  assignLeads,
  changeLeadStage,
  convertLeadToClient,
  createLead,
  deleteLead,
  findDuplicates,
  markLeadLost,
  mergeLeads,
  reactivateLead,
  setEntityTags,
  setPriority,
  updateLead,
} from "@/lib/services/leads";
import { activitySchema, createLeadSchema, mergeSchema, prioritySchema, stageSchema, tagsSchema, updateLeadSchema } from "@/lib/validation/leads";

export const createLeadAction = defineAction({
  schema: createLeadSchema,
  handler: async ({ session, db }, input) => {
    const labels = await loadLabelFns(db);
    return createLead(db, session, input.lead, input.duplicateMode, labels);
  },
  successMessage: (r) => (r.merged ? "Consulta fusionada con el contacto existente" : "Lead creado"),
});

export const updateLeadAction = defineAction({
  schema: updateLeadSchema,
  successMessage: "Lead actualizado",
  handler: async ({ session, db }, input) => {
    await updateLead(db, session, input.id, input.lead);
  },
});

export const deleteLeadAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  capability: "leads.delete",
  successMessage: "Lead eliminado",
  handler: async ({ db }, input) => {
    await deleteLead(db, input.id);
  },
});

export const assignLeadsAction = defineAction({
  schema: z.object({ ids: z.array(z.string().uuid()).min(1).max(500), userId: z.string().uuid(), moveOpenWork: z.boolean().optional() }),
  handler: async ({ session, db }, input) => assignLeads(db, session, input.ids, input.userId, input.moveOpenWork ?? true),
  successMessage: (n) => (n === 1 ? "Lead asignado" : `${n} leads asignados`),
});

export const changeLeadStageAction = defineAction({
  schema: stageSchema,
  successMessage: "Etapa actualizada",
  handler: async ({ session, db }, input) => {
    await changeLeadStage(db, session, input.id, input.stage);
  },
});

export const setPriorityAction = defineAction({
  schema: prioritySchema,
  successMessage: "Prioridad actualizada",
  handler: async ({ db }, input) => {
    await setPriority(db, input.entity === "lead" ? "leads" : "opportunities", input.id, input.priority);
  },
});

export const setTagsAction = defineAction({
  schema: tagsSchema,
  successMessage: "Etiquetas actualizadas",
  handler: async ({ session, db }, input) => {
    await setEntityTags(db, session, input.entity, input.id, input.tagIds);
  },
});

export const reactivateLeadAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  successMessage: "Lead reactivado: se creó una tarea para retomar el contacto",
  handler: async ({ session, db }, input) => {
    await reactivateLead(db, session, input.id);
  },
});

export const convertLeadAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  handler: async ({ session, db }, input) => convertLeadToClient(db, session, input.id),
  successMessage: (r) => (r.created ? "Lead convertido en cliente" : "El lead ya era cliente"),
});

export const mergeLeadsAction = defineAction({
  schema: mergeSchema,
  capability: "leads.delete",
  successMessage: "Leads fusionados",
  handler: async ({ session, db }, input) => {
    await mergeLeads(db, session, input.sourceId, input.targetId);
  },
});

export const findDuplicatesAction = defineAction({
  schema: z.object({ phone: z.string().optional(), email: z.string().optional(), excludeId: z.string().uuid().optional() }),
  handler: async ({ db }, input) => findDuplicates(db, input),
});

export const logActivityAction = defineAction({
  schema: activitySchema,
  handler: async ({ session, db }, input) => logActivity(db, session, input),
  successMessage: "Actividad registrada",
});

export const updateNoteAction = defineAction({
  schema: z.object({ id: z.string().uuid(), body: z.string().trim().min(1, "Escribe la nota").max(2000) }),
  successMessage: "Nota actualizada",
  handler: async ({ db }, input) => {
    await updateNote(db, input.id, input.body);
  },
});

export const pinNoteAction = defineAction({
  schema: z.object({ id: z.string().uuid(), pinned: z.boolean() }),
  handler: async ({ db }, input) => {
    await setNotePinned(db, input.id, input.pinned);
  },
});

export const deleteNoteAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  successMessage: "Nota eliminada",
  handler: async ({ db }, input) => {
    await deleteNote(db, input.id);
  },
});

export const markLeadLostAction = defineAction({
  schema: z.object({ id: z.string().uuid(), reason: z.string().min(1, "Selecciona el motivo de pérdida"), notes: z.string().trim().max(500).optional() }),
  successMessage: "Lead marcado como perdido",
  handler: async ({ session, db }, input) => {
    const labels = await loadLabelFns(db);
    await markLeadLost(db, session, input.id, input.reason, input.notes?.trim() || null, labels.lossReason);
  },
});

