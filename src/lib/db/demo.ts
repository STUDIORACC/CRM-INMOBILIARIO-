import { applyMigrations } from "./migrate";
import { makeDb } from "./index";
import type { PgliteDriver } from "./drivers/pglite";

/**
 * Prepara la base demo embebida: aplica el esquema (y migraciones nuevas, de forma
 * idempotente) y carga los datos de demostración la primera vez. Queda persistida en .data/pglite.
 */
export async function ensureDemoReady(driver: PgliteDriver): Promise<void> {
  const res = await driver.raw.query<{ t: string | null }>("select to_regclass('public.leads')::text as t");
  const fresh = !res.rows[0]?.t;

  await driver.transaction(async (tx) => {
    await applyMigrations(tx, { shim: true });
  });

  if (!fresh) return;

  const { seedDemo } = await import("../seed");
  const { demoSeedHooks } = await import("../auth/demo-users");
  await driver.transaction(async (tx) => {
    await seedDemo(makeDb(tx), demoSeedHooks);
  });
}
