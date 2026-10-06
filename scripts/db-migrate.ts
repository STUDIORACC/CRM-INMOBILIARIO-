/**
 * Aplica las migraciones de supabase/migrations a la base configurada.
 *   npm run db:migrate
 *
 * Con DATABASE_URL (Supabase) aplica solo lo pendiente. Sin DATABASE_URL (modo demo)
 * la base embebida se prepara sola al iniciar la app, así que aquí solo se verifica.
 */
import { applyMigrations } from "@/lib/db/migrate";
import { createPostgresDriver } from "@/lib/db/drivers/postgres";
import { getDriver, isDemoMode } from "@/lib/db";

async function main() {
  if (isDemoMode()) {
    await getDriver();
    console.log("Modo demo: la base embebida (.data/pglite) está lista y al día con las migraciones.");
    return;
  }
  const driver = createPostgresDriver(process.env.DATABASE_URL!);
  const applied = await driver.transaction((tx) => applyMigrations(tx, { shim: false }));
  console.log(applied.length ? `Migraciones aplicadas:\n - ${applied.join("\n - ")}` : "La base ya estaba al día: no hay migraciones pendientes.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error al migrar:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
