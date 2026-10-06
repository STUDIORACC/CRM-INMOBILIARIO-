import fs from "node:fs";
import path from "node:path";
import type { RawTx } from "./types";

const root = () => path.join(process.cwd(), "supabase");

function listSql(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Aplica las migraciones pendientes de supabase/migrations.
 * En modo demo antepone la emulación de Supabase (auth + roles).
 * Devuelve los nombres aplicados.
 */
export async function applyMigrations(tx: RawTx, opts: { shim: boolean }): Promise<string[]> {
  const applied: string[] = [];

  await tx.exec(`
    create table if not exists public.crm_schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const done = new Set(
    (await tx.query("select name from public.crm_schema_migrations", [])).map((r) => String(r.name)),
  );

  const files: Array<{ name: string; file: string }> = [];
  if (opts.shim) {
    for (const f of listSql(path.join(root(), "demo"))) {
      files.push({ name: `demo/${f}`, file: path.join(root(), "demo", f) });
    }
  }
  for (const f of listSql(path.join(root(), "migrations"))) {
    files.push({ name: f, file: path.join(root(), "migrations", f) });
  }

  for (const { name, file } of files) {
    if (done.has(name)) continue;
    await tx.exec(fs.readFileSync(file, "utf8"));
    await tx.query("insert into public.crm_schema_migrations (name) values ($1)", [name]);
    applied.push(name);
  }
  return applied;
}
