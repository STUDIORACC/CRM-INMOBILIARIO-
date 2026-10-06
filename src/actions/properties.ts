"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defineAction, runAction } from "@/lib/actions/safe";
import { AppError } from "@/lib/errors";
import { ALLOWED_IMAGE_TYPES, BUCKETS, MAX_UPLOAD_BYTES, imagePublicUrl, storageDelete, storagePut } from "@/lib/storage";
import {
  addPropertyImage,
  changePrice,
  changePropertyState,
  createProperty,
  deleteImage,
  deleteProperty,
  moveImage,
  setCoverImage,
  updateProperty,
} from "@/lib/services/properties";
import { imageUrlSchema, priceChangeSchema, propertySchema, statusChangeSchema } from "@/lib/validation/properties";

export const createPropertyAction = defineAction({
  schema: propertySchema,
  capability: "properties.create",
  successMessage: "Propiedad registrada",
  handler: async ({ session, db }, input) => createProperty(db, session, input),
});

export const updatePropertyAction = defineAction({
  schema: z.object({ id: z.string().uuid(), property: propertySchema }),
  successMessage: "Propiedad actualizada",
  handler: async ({ session, db }, input) => {
    await updateProperty(db, session, input.id, input.property);
  },
});

export const changePropertyStateAction = defineAction({
  schema: statusChangeSchema,
  successMessage: "Estado actualizado",
  handler: async ({ session, db }, input) => {
    await changePropertyState(db, session, input.id, { status: input.status, publicationStatus: input.publicationStatus });
  },
});

export const changePriceAction = defineAction({
  schema: priceChangeSchema,
  successMessage: "Precio actualizado y registrado en el historial",
  handler: async ({ session, db }, input) => {
    await changePrice(db, session, input.id, input.price, input.minPrice ?? null);
  },
});

export const deletePropertyAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  capability: "properties.delete",
  successMessage: "Propiedad eliminada",
  handler: async ({ db }, input) => {
    await deleteProperty(db, input.id);
  },
});

export const addImageUrlAction = defineAction({
  schema: imageUrlSchema,
  successMessage: "Imagen agregada",
  handler: async ({ session, db }, input) => addPropertyImage(db, session, input.propertyId, input.url, input.caption?.trim() || null, null),
});

export const setCoverAction = defineAction({
  schema: z.object({ propertyId: z.string().uuid(), imageId: z.string().uuid() }),
  successMessage: "Portada actualizada",
  handler: async ({ session, db }, input) => {
    await setCoverImage(db, session, input.propertyId, input.imageId);
  },
});

export const moveImageAction = defineAction({
  schema: z.object({ propertyId: z.string().uuid(), imageId: z.string().uuid(), direction: z.union([z.literal(-1), z.literal(1)]) }),
  handler: async ({ session, db }, input) => {
    await moveImage(db, session, input.propertyId, input.imageId, input.direction);
  },
});

export const deleteImageAction = defineAction({
  schema: z.object({ propertyId: z.string().uuid(), imageId: z.string().uuid() }),
  successMessage: "Imagen eliminada",
  handler: async ({ session, db }, input) => {
    const { storagePath } = await deleteImage(db, session, input.propertyId, input.imageId);
    if (storagePath) await storageDelete(BUCKETS.images, storagePath).catch(() => undefined);
  },
});

/** Sube una foto de la propiedad al almacenamiento (Supabase Storage o disco en demo). */
export async function uploadPropertyImageAction(formData: FormData) {
  return runAction(
    async ({ session, db }) => {
      const propertyId = String(formData.get("propertyId") ?? "");
      const file = formData.get("file");
      if (!z.string().uuid().safeParse(propertyId).success) throw new AppError("Propiedad inválida.");
      if (!(file instanceof File) || file.size === 0) throw new AppError("Selecciona una imagen.");
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new AppError("Formato no admitido. Usa JPG, PNG, WebP o AVIF.");
      if (file.size > MAX_UPLOAD_BYTES) throw new AppError("La imagen supera los 10 MB.");
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      const path = `properties/${propertyId}/${randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await storagePut(BUCKETS.images, path, bytes, file.type);
      return addPropertyImage(db, session, propertyId, imagePublicUrl(path), null, path);
    },
    { successMessage: "Imagen subida" },
  );
}
