"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defineAction, runAction } from "@/lib/actions/safe";
import { AppError } from "@/lib/errors";
import { insertDocument, removeDocument } from "@/lib/services/documents";
import { ALLOWED_DOC_TYPES, BUCKETS, MAX_UPLOAD_BYTES, storageDelete, storagePut } from "@/lib/storage";

const CATEGORIES = ["identity", "contract", "deed", "plans", "valuation", "financing", "other"];

/** Adjunta un documento (DNI, contrato, planos…) a un propietario, cliente, propiedad o lead. */
export async function uploadDocumentAction(formData: FormData) {
  return runAction(
    async ({ session, db }) => {
      const file = formData.get("file");
      const category = String(formData.get("category") ?? "other");
      const scopeKey = (["ownerId", "clientId", "propertyId", "leadId"] as const).find((k) => formData.get(k));
      if (!scopeKey) throw new AppError("Indica a qué registro pertenece el documento.");
      const scopeId = String(formData.get(scopeKey));
      if (!z.string().uuid().safeParse(scopeId).success) throw new AppError("Registro inválido.");
      if (!CATEGORIES.includes(category)) throw new AppError("Categoría inválida.");
      if (!(file instanceof File) || file.size === 0) throw new AppError("Selecciona un archivo.");
      if (file.size > MAX_UPLOAD_BYTES) throw new AppError("El archivo supera los 10 MB.");
      if (!ALLOWED_DOC_TYPES.has(file.type)) throw new AppError("Formato no admitido. Usa PDF, imágenes, Word, Excel o texto.");

      const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
      const folder = scopeKey.replace("Id", "s");
      const path = `${folder}/${scopeId}/${randomUUID()}-${safe}`;
      await storagePut(BUCKETS.documents, path, new Uint8Array(await file.arrayBuffer()), file.type);
      try {
        return await insertDocument(db, session, { name: file.name.slice(0, 120), category, storagePath: path, mime: file.type, size: file.size, [scopeKey]: scopeId });
      } catch (err) {
        await storageDelete(BUCKETS.documents, path).catch(() => undefined);
        throw err;
      }
    },
    { successMessage: "Documento adjuntado" },
  );
}

export const deleteDocumentAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  successMessage: "Documento eliminado",
  handler: async ({ db }, input) => {
    const { storagePath } = await removeDocument(db, input.id);
    await storageDelete(BUCKETS.documents, storagePath).catch(() => undefined);
  },
});
