"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withAdmin, isDemoMode } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { DEMO_COOKIE, createDemoSessionToken, demoCookieOptions } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/actions/safe";

// Limitador simple en memoria (por correo) para frenar fuerza bruta en una sola instancia.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function safeNext(next?: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function loginAction(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Revisa tu correo y contraseña." };
  const { email, password, next } = parsed.data;
  const key = email.toLowerCase();
  if (tooManyAttempts(key)) return { ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };

  if (isDemoMode()) {
    const row = await withAdmin((db) =>
      db.one<{ id: string; encrypted_password: string | null }>(
        `select a.id, a.encrypted_password
           from auth.users a join public.users u on u.id = a.id
          where lower(a.email) = $1 and u.status = 'active'`,
        [key],
      ),
    );
    if (!row || !verifyPassword(password, row.encrypted_password)) {
      return { ok: false, error: "Correo o contraseña incorrectos." };
    }
    (await cookies()).set(DEMO_COOKIE, await createDemoSessionToken(row.id), demoCookieOptions);
    attempts.delete(key);
    return { ok: true, data: { redirectTo: safeNext(next) } };
  }

  const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: key, password });
  if (error || !data.user) return { ok: false, error: "Correo o contraseña incorrectos." };

  const profile = await withAdmin((db) =>
    db.one<{ id: string }>("select id from public.users where id = $1 and status = 'active'", [data.user.id]),
  );
  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, error: "Tu usuario no tiene acceso al CRM. Contacta al administrador." };
  }
  attempts.delete(key);
  return { ok: true, data: { redirectTo: safeNext(next) } };
}

export async function logoutAction(): Promise<void> {
  if (isDemoMode()) {
    (await cookies()).delete(DEMO_COOKIE);
  } else {
    const { createSupabaseServerClient } = await import("@/lib/auth/supabase");
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
