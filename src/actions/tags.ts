"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { AppError } from "@/lib/errors";

const tagSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(30, "Máximo 30 caracteres"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
});

export const createTagAction = defineAction({
  schema: tagSchema,
  successMessage: "Etiqueta creada",
  handler: async ({ db }, input) => {
    const existing = await db.one<{ id: string }>("select id from public.tags where lower(name) = lower($1)", [input.name]);
    if (existing) throw new AppError("Ya existe una etiqueta con ese nombre.", { name: ["Ya existe"] });
    const row = await db.one<{ id: string; name: string; color: string }>("insert into public.tags (name, color) values ($1, $2) returning id, name, color", [input.name, input.color]);
    return row!;
  },
});

export const updateTagAction = defineAction({
  schema: tagSchema.extend({ id: z.string().uuid() }),
  capability: "tags.manage",
  successMessage: "Etiqueta actualizada",
  handler: async ({ db }, input) => {
    const res = await db.query("update public.tags set name = $2, color = $3 where id = $1 returning id", [input.id, input.name, input.color]);
    if (res.length === 0) throw new AppError("No se pudo actualizar la etiqueta.");
  },
});

export const deleteTagAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  capability: "tags.manage",
  successMessage: "Etiqueta eliminada",
  handler: async ({ db }, input) => {
    await db.query("delete from public.tags where id = $1", [input.id]);
  },
});
