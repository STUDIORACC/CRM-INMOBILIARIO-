/**
 * Reinicia el modo demo: borra la base embebida y los archivos subidos. En el siguiente inicio
 * la app vuelve a crear el esquema y los datos de ejemplo. Detén el servidor antes de ejecutarlo.
 *   npm run demo:reset
 */
import fs from "node:fs";
import path from "node:path";

const targets = [process.env.DEMO_DATA_DIR ?? ".data/pglite", process.env.DEMO_UPLOAD_DIR ?? ".data/uploads"].map((p) => path.join(process.cwd(), p));

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL está definida: esta app usa Supabase, no la base demo. No se borró nada.");
  process.exit(1);
}
for (const t of targets) {
  if (fs.existsSync(t)) {
    fs.rmSync(t, { recursive: true, force: true });
    console.log(`Eliminado: ${path.relative(process.cwd(), t)}`);
  }
}
console.log("Listo. Al iniciar la app (npm run dev) se recrearán los datos de demostración.");
