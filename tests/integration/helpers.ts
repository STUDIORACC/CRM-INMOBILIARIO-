import type { SessionUser } from "@/lib/auth/session";
import { withAdmin, withUser, type Db } from "@/lib/db";
import type { Role } from "@/lib/domain/constants";

/**
 * Helpers de integración. `withUser` / `withAdmin` usan el singleton de la app: con DEMO_IN_MEMORY=1
 * (ver vitest.config.mts) crea un Postgres embebido en memoria, aplica las migraciones y siembra los
 * datos de demostración, igual que al iniciar la app en modo demo.
 */
export const admin = <T>(fn: (db: Db) => Promise<T>) => withAdmin(fn);

export interface Actor {
  session: SessionUser;
  /** Ejecuta `fn` en una transacción bajo RLS como este usuario. */
  run: <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
}

export async function actorByRole(role: Role, nth = 0): Promise<Actor> {
  const row = await withAdmin((db) =>
    db.query<{ id: string; email: string; full_name: string; role: Role; avatar_url: string | null; phone: string | null }>(
      "select id, email, full_name, role, avatar_url, phone from public.users where role = $1 and status = 'active' order by hired_at, full_name",
      [role],
    ),
  );
  const u = row[nth];
  if (!u) throw new Error(`No hay usuario con rol ${role} (#${nth})`);
  return makeActor({ id: u.id, email: u.email, fullName: u.full_name, role: u.role, avatarUrl: u.avatar_url, phone: u.phone });
}

export function makeActor(session: SessionUser): Actor {
  return { session, run: (fn) => withUser({ id: session.id, email: session.email }, fn) };
}

export async function count(db: Db, sql: string, params: unknown[] = []): Promise<number> {
  return Number((await db.scalar<number>(sql, params as never[])) ?? 0);
}

export const labels = { source: (k: string) => k };

/** Fecha futura en formato datetime-local (hora de Lima) para agendar visitas. */
export function futureLocal(daysAhead: number, hh = 10, mm = 0): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  // La hora de Lima es UTC-5; construimos el valor en esa zona
  const lima = new Date(d.getTime() - 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${lima.getUTCFullYear()}-${p(lima.getUTCMonth() + 1)}-${p(lima.getUTCDate())}T${p(hh)}:${p(mm)}`;
}
