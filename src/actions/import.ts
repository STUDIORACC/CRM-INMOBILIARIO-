"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, describeError, type ActionResult } from "@/lib/actions/safe";
import { getSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { MAX_IMPORT_ROWS, type RawImportRow } from "@/lib/domain/lead-import";
import { can } from "@/lib/domain/permissions";
import { importRows, validateImport, type ImportOutcome } from "@/lib/services/lead-import";

const rowSchema = z.object({
  row: z.number().int().min(1),
  values: z.record(z.string(), z.string().max(2000)),
});
const optionsSchema = z.object({
  defaultSource: z.string().min(1, "Selecciona la fuente por defecto"),
  defaultAssignee: z.union([z.string().uuid(), z.literal("")]),
  duplicates: z.enum(["skip", "create"]),
});
const batchSchema = z.object({ rows: z.array(rowSchema).min(1).max(MAX_IMPORT_ROWS), options: optionsSchema });

const toRows = (rows: z.infer<typeof rowSchema>[]) => rows.map((r) => ({ row: r.row, values: r.values as RawImportRow }));

/** Paso de revisión: valida formato y detecta duplicados sin guardar nada. */
export const validateImportAction = defineAction({
  schema: batchSchema,
  capability: "leads.import",
  handler: ({ db, session }, input) => validateImport(db, session, toRows(input.rows), input.options),
});

/**
 * Importa un lote de filas. Cada fila se guarda en su propia transacción para que un error
 * puntual no descarte el resto; el cliente envía el archivo en lotes pequeños y muestra el avance.
 */
export async function importLeadsAction(raw: z.input<typeof batchSchema>): Promise<ActionResult<ImportOutcome[]>> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    if (!can(session.role, "leads.import")) return { ok: false, error: "No tienes permiso para importar leads." };
    const parsed = batchSchema.safeParse(raw);
    if (!parsed.success) {
      const { message, fieldErrors } = describeError(parsed.error);
      return { ok: false, error: message, fieldErrors };
    }
    const actor = { id: session.id, email: session.email };
    const data = await importRows(toRows(parsed.data.rows), parsed.data.options, { session, run: (fn) => withUser(actor, fn) });
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    const { message } = describeError(err);
    return { ok: false, error: message };
  }
}
