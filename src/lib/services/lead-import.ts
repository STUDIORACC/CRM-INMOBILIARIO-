import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/types";
import { dedupeKeys, normalizeImportRow, type ImportContext, type RawImportRow } from "@/lib/domain/lead-import";
import { normalizePhone } from "@/lib/domain/phone";
import { loadCatalogs, loadLabelFns } from "./catalogs";
import { createLead, findDuplicates } from "./leads";

export type ImportRowStatus = "ok" | "duplicate" | "error";

export interface ImportRowResult {
  /** Número de fila en el archivo (sin contar el encabezado). */
  row: number;
  status: ImportRowStatus;
  name: string;
  errors: string[];
  warnings: string[];
  duplicate?: { kind: "lead" | "client"; id: string; name: string; reason: string };
}

export interface ImportOptions {
  defaultSource: string;
  defaultAssignee: string;
  /** skip: omite los repetidos · create: los importa igual */
  duplicates: "skip" | "create";
}

export interface ImportRowInput {
  row: number;
  values: RawImportRow;
}

export async function buildImportContext(db: Db, session: SessionUser, opts: ImportOptions): Promise<ImportContext> {
  const c = await loadCatalogs(db);
  const assignable = c.users.filter((u) => u.status === "active" && u.role !== "assistant");
  // Un asesor solo puede importar leads a su nombre
  const defaultAssignee = session.role === "advisor" ? session.id : opts.defaultAssignee;
  return {
    sources: c.sources.filter((s) => s.active).map((s) => ({ key: s.key, label: s.label })),
    propertyTypes: c.propertyTypes.filter((s) => s.active).map((s) => ({ key: s.key, label: s.label })),
    districts: c.districts.filter((s) => s.active).map((s) => ({ key: s.key, label: s.label })),
    users: session.role === "advisor" ? assignable.filter((u) => u.id === session.id).map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })) : assignable.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })),
    defaultSource: opts.defaultSource,
    defaultAssignee,
  };
}

/** Revisa cada fila (formato, duplicados contra la base y dentro del archivo) sin guardar nada. */
export async function validateImport(db: Db, session: SessionUser, rows: ImportRowInput[], opts: ImportOptions): Promise<ImportRowResult[]> {
  const ctx = await buildImportContext(db, session, opts);
  const seen = new Map<string, number>();
  const out: ImportRowResult[] = [];
  for (const r of rows) {
    const n = normalizeImportRow(r.values, ctx);
    const base = { row: r.row, name: (r.values.fullName ?? "").toString().trim() || `Fila ${r.row}`, errors: n.errors, warnings: n.warnings };
    if (!n.input) {
      out.push({ ...base, status: "error" });
      continue;
    }
    const keys = dedupeKeys(n.input, normalizePhone);
    const inFile = keys.map((k) => seen.get(k)).find((x) => x != null);
    keys.forEach((k) => !seen.has(k) && seen.set(k, r.row));
    if (inFile != null) {
      out.push({ ...base, status: "duplicate", duplicate: { kind: "lead", id: "", name: "Repetido en el archivo", reason: `Mismo teléfono o correo que la fila ${inFile}` } });
      continue;
    }
    const dups = await findDuplicates(db, { phone: n.input.phone, email: n.input.email });
    if (dups.length > 0) {
      const d = dups[0];
      const reason = d.phone_match && d.email_match ? "Mismo teléfono y correo" : d.phone_match ? "Mismo teléfono" : "Mismo correo";
      out.push({ ...base, status: "duplicate", duplicate: { kind: d.kind, id: d.id, name: d.full_name, reason } });
      continue;
    }
    out.push({ ...base, status: "ok" });
  }
  return out;
}

export interface ImportOutcome {
  row: number;
  name: string;
  result: "created" | "skipped" | "failed";
  message?: string;
  id?: string;
}

/**
 * Crea los leads de un lote. Cada fila corre en su propia transacción (la entrega `runRow`),
 * de modo que un fallo puntual no descarta el resto del lote.
 */
export async function importRows(
  rows: ImportRowInput[],
  opts: ImportOptions,
  deps: { session: SessionUser; run: <T>(fn: (db: Db) => Promise<T>) => Promise<T> },
): Promise<ImportOutcome[]> {
  const ctx = await deps.run((db) => buildImportContext(db, deps.session, opts));
  const labels = await deps.run((db) => loadLabelFns(db));
  const out: ImportOutcome[] = [];
  for (const r of rows) {
    const name = (r.values.fullName ?? "").toString().trim() || `Fila ${r.row}`;
    const n = normalizeImportRow(r.values, ctx);
    if (!n.input) {
      out.push({ row: r.row, name, result: "failed", message: n.errors.join("; ") });
      continue;
    }
    try {
      const res = await deps.run(async (db) => {
        if (opts.duplicates === "skip") {
          const dups = await findDuplicates(db, { phone: n.input!.phone, email: n.input!.email });
          if (dups.length > 0) return null;
        }
        return createLead(db, deps.session, n.input!, "create", { source: labels.source });
      });
      out.push(res ? { row: r.row, name, result: "created", id: res.id } : { row: r.row, name, result: "skipped", message: "Ya existía un lead o cliente con ese teléfono o correo" });
    } catch (err) {
      console.error("[import] fila fallida", r.row, err);
      out.push({ row: r.row, name, result: "failed", message: "No se pudo guardar esta fila" });
    }
  }
  return out;
}
