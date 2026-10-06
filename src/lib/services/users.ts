import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/types";
import { isDemoMode } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { nn } from "@/lib/validation/common";
import type { ChangePasswordInput, ProfileInput, UserCreateInput, UserUpdateInput } from "@/lib/validation/settings";

/**
 * Alta de usuario. En Supabase se crea mediante la API de administración (Auth) y luego se inserta el perfil;
 * en modo demo se inserta directamente en el esquema auth emulado.
 * Debe ejecutarse dentro de una transacción privilegiada (`defineAdminAction`).
 */
export async function createUserAccount(db: Db, input: UserCreateInput): Promise<{ id: string }> {
  const email = input.email.toLowerCase();
  const taken = await db.one<{ id: string }>("select id from public.users where lower(email) = $1", [email]);
  if (taken) throw new AppError("Ya existe un usuario con ese correo.", { email: ["Este correo ya está registrado"] });

  let id: string;
  let rollback: (() => Promise<void>) | null = null;
  if (isDemoMode()) {
    id = randomUUID();
    await db.query("insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, $3, $4::jsonb)", [id, email, hashPassword(input.password), JSON.stringify({ full_name: input.fullName })]);
  } else {
    const { createSupabaseAdminClient } = await import("@/lib/auth/supabase");
    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName } });
    if (error || !data.user) {
      if (error?.message?.toLowerCase().includes("already")) throw new AppError("Ya existe un usuario con ese correo.", { email: ["Este correo ya está registrado"] });
      throw new AppError(`No se pudo crear la cuenta: ${error?.message ?? "error desconocido"}`);
    }
    id = data.user.id;
    rollback = async () => {
      await admin.auth.admin.deleteUser(id);
    };
  }
  try {
    await db.query("insert into public.users (id, full_name, email, phone, role, status) values ($1, $2, $3, $4, $5, 'active')", [id, input.fullName, email, nn(input.phone), input.role]);
  } catch (err) {
    await rollback?.();
    throw err;
  }
  return { id };
}

async function activeAdmins(db: Db, excluding?: string): Promise<number> {
  return Number((await db.scalar<number>("select count(*) from public.users where role = 'admin' and status = 'active' and ($1::uuid is null or id <> $1::uuid)", [excluding ?? null])) ?? 0);
}

/** Traspasa el trabajo abierto de un usuario a otro (al desactivarlo). */
async function reassignOpenWork(db: Db, from: string, to: string): Promise<Record<string, number>> {
  const count = async (sql: string) => (await db.query(sql, [from, to])).length;
  return {
    leads: await count("update public.leads set assigned_to = $2 where assigned_to = $1 and stage not in ('won', 'lost') returning id"),
    clients: await count("update public.clients set assigned_to = $2 where assigned_to = $1 returning id"),
    opportunities: await count("update public.opportunities o set assigned_to = $2 from public.pipeline_stages s where o.assigned_to = $1 and s.key = o.stage and s.kind = 'open' returning o.id"),
    tasks: await count("update public.tasks set assigned_to = $2 where assigned_to = $1 and status in ('pending', 'in_progress') returning id"),
    visits: await count("update public.visits set advisor_id = $2 where advisor_id = $1 and status in ('scheduled', 'confirmed') and scheduled_at >= now() returning id"),
    properties: await count("update public.properties set advisor_id = $2 where advisor_id = $1 and status in ('available', 'reserved') returning id"),
  };
}

export async function updateUserAccount(db: Db, actor: SessionUser, input: UserUpdateInput): Promise<{ reassigned: Record<string, number> | null }> {
  const current = await db.one<{ role: string; status: string; full_name: string }>("select role, status, full_name from public.users where id = $1", [input.id]);
  if (!current) throw new AppError("No se encontró el usuario.");

  if (input.id === actor.id) {
    if (input.status === "inactive") throw new AppError("No puedes desactivar tu propia cuenta.", { status: ["No puedes desactivarte"] });
    if (input.role !== current.role) throw new AppError("No puedes cambiar tu propio rol. Pide a otro administrador que lo haga.", { role: ["No puedes cambiar tu rol"] });
  }
  const losesAdmin = current.role === "admin" && current.status === "active" && (input.role !== "admin" || input.status !== "active");
  if (losesAdmin && (await activeAdmins(db, input.id)) === 0) {
    throw new AppError("Debe quedar al menos un administrador activo.", { role: ["Es el único administrador activo"] });
  }

  let reassigned: Record<string, number> | null = null;
  const deactivating = current.status === "active" && input.status === "inactive";
  const to = nn(input.reassignTo);
  if (deactivating && to) {
    if (to === input.id) throw new AppError("Elige a otro usuario para traspasar el trabajo.", { reassignTo: ["Elige otro usuario"] });
    const target = await db.one<{ status: string; role: string }>("select status, role from public.users where id = $1", [to]);
    if (!target || target.status !== "active" || target.role === "assistant") throw new AppError("El usuario destino debe estar activo y poder gestionar leads.", { reassignTo: ["Usuario no válido"] });
    reassigned = await reassignOpenWork(db, input.id, to);
  }

  await db.query("update public.users set full_name = $2, phone = $3, role = $4, status = $5 where id = $1", [input.id, input.fullName, nn(input.phone), input.role, input.status]);
  return { reassigned };
}

export async function resetUserPassword(db: Db, userId: string, password: string): Promise<void> {
  const user = await db.one<{ id: string }>("select id from public.users where id = $1", [userId]);
  if (!user) throw new AppError("No se encontró el usuario.");
  if (isDemoMode()) {
    await db.query("update auth.users set encrypted_password = $2 where id = $1", [userId, hashPassword(password)]);
    return;
  }
  const { createSupabaseAdminClient } = await import("@/lib/auth/supabase");
  const admin = await createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new AppError(`No se pudo cambiar la contraseña: ${error.message}`);
}

/** Datos propios editables (RLS permite que cada usuario actualice su fila). */
export async function updateOwnProfile(db: Db, userId: string, input: ProfileInput): Promise<void> {
  const res = await db.query("update public.users set full_name = $2, phone = $3 where id = $1 returning id", [userId, input.fullName, nn(input.phone)]);
  if (res.length === 0) throw new AppError("No se pudo actualizar tu perfil.");
}

/** Cambio de contraseña propio: exige la contraseña actual. */
export async function changeOwnPassword(db: Db, session: SessionUser, input: ChangePasswordInput): Promise<void> {
  if (isDemoMode()) {
    const row = await db.one<{ encrypted_password: string | null }>("select encrypted_password from auth.users where id = $1", [session.id]);
    if (!row || !verifyPassword(input.currentPassword, row.encrypted_password)) {
      throw new AppError("La contraseña actual no es correcta.", { currentPassword: ["Contraseña incorrecta"] });
    }
    await db.query("update auth.users set encrypted_password = $2 where id = $1", [session.id, hashPassword(input.newPassword)]);
    return;
  }
  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const check = await supabase.auth.signInWithPassword({ email: session.email, password: input.currentPassword });
  if (check.error) throw new AppError("La contraseña actual no es correcta.", { currentPassword: ["Contraseña incorrecta"] });
  const { error } = await supabase.auth.updateUser({ password: input.newPassword });
  if (error) throw new AppError(`No se pudo cambiar la contraseña: ${error.message}`);
}
