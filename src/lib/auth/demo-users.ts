import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db/types";
import { storagePut, BUCKETS } from "@/lib/storage";
import { hashPassword } from "./password";

/** Usuarios del modo demo: se crean en auth.users (emulado) con contraseña hasheada. */
export const demoSeedHooks = {
  async createAuthUser(db: Db, u: { email: string; password: string; fullName: string }): Promise<string> {
    const id = randomUUID();
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
