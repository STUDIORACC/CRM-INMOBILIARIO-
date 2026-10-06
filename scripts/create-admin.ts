/**
 * Crea un usuario administrador (primer acceso a una instalación nueva).
 *   npm run db:create-admin -- --email gerente@miinmobiliaria.pe --name "Nombre Apellido" --password "ClaveSegura123"
 * También acepta ADMIN_EMAIL, ADMIN_NAME y ADMIN_PASSWORD como variables de entorno.
 */
import { withAdmin } from "@/lib/db";
import { createUserAccount } from "@/lib/services/users";
import { userCreateSchema } from "@/lib/validation/settings";
import { parseArgs } from "./_args";

async function main() {
  const args = parseArgs();
  const parsed = userCreateSchema.safeParse({
    fullName: String(args.name ?? process.env.ADMIN_NAME ?? ""),
    email: String(args.email ?? process.env.ADMIN_EMAIL ?? ""),
    phone: String(args.phone ?? ""),
    role: "admin",
    password: String(args.password ?? process.env.ADMIN_PASSWORD ?? ""),
  });
  if (!parsed.success) {
    console.error("Datos inválidos:");
    for (const i of parsed.error.issues) console.error(` - ${i.path.join(".")}: ${i.message}`);
    console.error('\nUso: npm run db:create-admin -- --email correo@empresa.pe --name "Nombre Apellido" --password "Clave123"');
    process.exit(1);
  }
  const { id } = await withAdmin((db) => createUserAccount(db, parsed.data));
  console.log(`Administrador creado: ${parsed.data.email} (${id}). Ya puede iniciar sesión.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("No se pudo crear el administrador:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
