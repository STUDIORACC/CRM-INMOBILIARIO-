import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { serializeParam } from "./params";
import type { Db, DbActor, Driver, RawTx, SqlParam } from "./types";

export * from "./types";
export { Filters, likePattern } from "./builder";

/** Sin DATABASE_URL la app corre en modo demo sobre PGlite (Postgres embebido). */
export function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}

export function makeDb(tx: RawTx): Db {
  const query = async <T,>(text: string, params: SqlParam[] = []) =>
    (await tx.query(text, params.map(serializeParam))) as T[];
  return {
    query,
    one: async <T,>(text: string, params: SqlParam[] = []) => (await query<T>(text, params))[0] ?? null,
    scalar: async <T = number,>(text: string, params: SqlParam[] = []) => {
      const row = (await query<Record<string, unknown>>(text, params))[0];
      return row ? ((Object.values(row)[0] as T) ?? null) : null;
    },
  };
}

const globalForDb = globalThis as unknown as { __crmDriver?: Promise<Driver> };

async function createDriver(): Promise<Driver> {
  if (!isDemoMode()) {
    const { createPostgresDriver } = await import("./drivers/postgres");
    return createPostgresDriver(process.env.DATABASE_URL!);
  }
  const { createPgliteDriver } = await import("./drivers/pglite");
  const inMemory = Boolean(process.env.VERCEL) || process.env.DEMO_IN_MEMORY === "1";
  const dir = inMemory ? undefined : path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DEMO_DATA_DIR ?? ".data/pglite");
  if (dir) await fs.mkdir(path.dirname(dir), { recursive: true });
  const driver = await createPgliteDriver(dir);
  const { ensureDemoReady } = await import("./demo");
  await ensureDemoReady(driver);
  return driver;
}

export function getDriver(): Promise<Driver> {
  if (!globalForDb.__crmDriver) {
    globalForDb.__crmDriver = createDriver().catch((err) => {
      globalForDb.__crmDriver = undefined;
      throw err;
    });
  }
  return globalForDb.__crmDriver;
}

/** Reinicia el singleton (usado al resetear el demo). */
export function resetDriverCache() {
  globalForDb.__crmDriver = undefined;
}

/**
 * Ejecuta `fn` en una transacción bajo el rol `authenticated` con los claims del
 * usuario, de modo que Row Level Security aplica exactamente igual que en PostgREST.
 */
export async function withUser<T>(actor: DbActor, fn: (db: Db) => Promise<T>): Promise<T> {
  const driver = await getDriver();
  return driver.transaction(async (tx) => {
    const claims = JSON.stringify({
      sub: actor.id,
      role: "authenticated",
      email: actor.email ?? undefined,
    });
    await tx.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
      claims,
      actor.id,
    ]);
    await tx.exec("set local role authenticated");
    return fn(makeDb(tx));
  });
}

/**
 * Transacción privilegiada que conserva la identidad de quien la solicita (auth.uid() en la auditoría).
 * Solo para operaciones que RLS no puede expresar, como el alta de usuarios en auth.users.
 */
export async function withAdminAs<T>(actor: DbActor, fn: (db: Db) => Promise<T>): Promise<T> {
  const driver = await getDriver();
  return driver.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: actor.id, role: "service_role", email: actor.email ?? undefined });
    await tx.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [claims, actor.id]);
    return fn(makeDb(tx));
  });
}

/** Transacción privilegiada (sin RLS): solo para tareas del sistema (cron, seed, alta de usuarios). */
export async function withAdmin<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const driver = await getDriver();
  return driver.transaction(async (tx) => fn(makeDb(tx)));
}
