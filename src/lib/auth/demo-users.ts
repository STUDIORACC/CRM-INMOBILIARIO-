import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "@/lib/db/types";
import { storagePut, BUCKETS } from "@/lib/storage";
import { hashPassword } from "./password";

/**
 * UUID estable derivado del correo. En Vercel cada instancia siembra su propia base en memoria: con ids aleatorios,
 * la cookie de sesión emitida por una instancia no valdría en otra y el visitante saldría de la sesión al azar.
 */
function demoUserId(email: string): string {
  const h = createHash("sha1").update(`altura-demo:${email.toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Usuarios del modo demo: se crean en auth.users (emulado) con contraseña hasheada. */
export const demoSeedHooks = {
  async createAuthUser(db: Db, u: { email: string; password: string; fullName: string }): Promise<string> {
    const id = demoUserId(u.email);
    await db.query(
      "insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, $3, $4::jsonb)",
      [id, u.email, hashPassword(u.password), JSON.stringify({ full_name: u.fullName })],
    );
    return id;
  },
  async putFile(objectPath: string, bytes: Uint8Array, mime: string): Promise<void> {
    await storagePut(BUCKETS.documents, objectPath, bytes, mime);
  },
};
