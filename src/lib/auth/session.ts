import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { isDemoMode, withAdmin } from "@/lib/db";
import type { Role } from "@/lib/domain/constants";
import { can, type Capability } from "@/lib/domain/permissions";
import { ForbiddenError } from "@/lib/errors";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatarUrl: string | null;
  phone: string | null;
}

export const DEMO_COOKIE = "crm_demo_session";
const DEMO_TTL_SECONDS = 60 * 60 * 24 * 7;

const demoSecret = () =>
  new TextEncoder().encode(process.env.DEMO_SESSION_SECRET ?? "crm-inmobiliario-demo-secret-change-me-in-env");

export async function createDemoSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DEMO_TTL_SECONDS}s`)
    .sign(demoSecret());
}

export const demoCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DEMO_TTL_SECONDS,
};

async function resolveUserId(): Promise<string | null> {
  if (isDemoMode()) {
    const token = (await cookies()).get(DEMO_COOKIE)?.value;
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, demoSecret());
      return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  }
  const { createSupabaseServerClient } = await import("./supabase");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}

/** Usuario autenticado y activo (una consulta por request). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const id = await resolveUserId();
  if (!id) return null;
  const row = await withAdmin((db) =>
    db.one<{ id: string; email: string; full_name: string; role: Role; avatar_url: string | null; phone: string | null }>(
      "select id, email, full_name, role, avatar_url, phone from public.users where id = $1 and status = 'active'",
      [id],
    ),
  );
  if (!row) return null;
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role, avatarUrl: row.avatar_url, phone: row.phone };
});

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export { ForbiddenError };

export function assertCan(session: SessionUser, capability: Capability): void {
  if (!can(session.role, capability)) throw new ForbiddenError();
}
