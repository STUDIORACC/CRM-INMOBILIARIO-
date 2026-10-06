/**
 * Carga datos de demostración (ficticios) en la base configurada.
 *   npm run db:seed -- --confirm          (Supabase: exige la bandera)
 *
 * En modo demo (sin DATABASE_URL) los datos ya se cargan solos la primera vez; usa `npm run demo:reset`
 * para volver al estado inicial. NO ejecutes esto contra una base de producción con datos reales.
 */
import { BUCKETS, storagePut } from "@/lib/storage";
import { createSupabaseAdminClient } from "@/lib/auth/supabase";
import { createPostgresDriver } from "@/lib/db/drivers/postgres";
import { getDriver, isDemoMode, makeDb } from "@/lib/db";
import { DEMO_PASSWORD, DEMO_USERS, seedDemo, type SeedHooks } from "@/lib/seed";
import { parseArgs } from "./_args";

async function main() {
  const args = parseArgs();
  if (isDemoMode()) {
    await getDriver();
    console.log("Modo demo: los datos de ejemplo ya están cargados (.data/pglite). Usa `npm run demo:reset` para reiniciarlos.");
    return;
  }
  if (!args.confirm) {
    console.error("Esto insertará datos FICTICIOS (leads, propiedades, usuarios de ejemplo) en la base configurada.\nVuelve a ejecutar con --confirm si es una base de pruebas.");
    process.exit(1);
  }

  const driver = createPostgresDriver(process.env.DATABASE_URL!);
  const existing = await driver.transaction(async (tx) => Number((await tx.query("select count(*)::int as n from public.leads", []))[0]?.n ?? 0));
  if (existing > 0 && !args.force) {
    console.error(`La base ya tiene ${existing} leads. Para sembrar de todos modos agrega --force (no recomendado en producción).`);
    process.exit(1);
  }

  const admin = await createSupabaseAdminClient();
  for (const name of Object.values(BUCKETS)) {
    const { error } = await admin.storage.createBucket(name, { public: name === BUCKETS.images, fileSizeLimit: 10 * 1024 * 1024 });
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  }

  const hooks: SeedHooks = {
    async createAuthUser(_db, u) {
      const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u.fullName } });
      if (error || !data.user) throw new Error(`No se pudo crear ${u.email}: ${error?.message}`);
      return data.user.id;
    },
    putFile: (p, bytes, mime) => storagePut(BUCKETS.documents, p, bytes, mime),
  };

  console.time("seed");
  await driver.transaction((tx) => seedDemo(makeDb(tx), hooks));
  console.timeEnd("seed");
  console.log(`\nListo. Usuarios de ejemplo (contraseña: ${DEMO_PASSWORD}):`);
  for (const u of DEMO_USERS) console.log(` - ${u.email}  (${u.role})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error al sembrar:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
