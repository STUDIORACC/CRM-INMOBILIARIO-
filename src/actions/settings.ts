"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { deleteTemplate, moveCatalogItem, saveCatalogItem, saveNotifySettings, saveTemplate, updateCompany, updateStage } from "@/lib/services/settings";
import { catalogItemSchema, companySchema, notifySchema, stageSchema, templateSchema } from "@/lib/validation/settings";

export const updateCompanyAction = defineAction({
  schema: companySchema,
  capability: "settings.manage",
  successMessage: "Datos de la empresa actualizados",
  handler: ({ db }, input) => updateCompany(db, input),
});

export const saveCatalogItemAction = defineAction({
  schema: catalogItemSchema,
  capability: "settings.manage",
  successMessage: "Catálogo actualizado",
  handler: ({ db }, input) => saveCatalogItem(db, input),
});

export const moveCatalogItemAction = defineAction({
  schema: z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }),
  capability: "settings.manage",
  handler: ({ db }, input) => moveCatalogItem(db, input.id, input.direction),
});

export const updateStageAction = defineAction({
  schema: stageSchema,
  capability: "settings.manage",
  successMessage: "Etapa actualizada",
  handler: ({ db }, input) => updateStage(db, input),
});

export const saveNotifySettingsAction = defineAction({
  schema: notifySchema,
  capability: "settings.manage",
  successMessage: "Preferencias de alertas guardadas",
  handler: ({ db }, input) => saveNotifySettings(db, input),
});

export const saveTemplateAction = defineAction({
  schema: templateSchema,
  capability: "templates.manage",
  successMessage: "Plantilla guardada",
  handler: ({ db }, input) => saveTemplate(db, input),
});

export const deleteTemplateAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  capability: "templates.manage",
  successMessage: "Plantilla eliminada",
  handler: ({ db }, input) => deleteTemplate(db, input.id),
});
