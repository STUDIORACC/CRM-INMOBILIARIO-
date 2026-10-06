import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { withAdminAs, withUser, type Db } from "@/lib/db";
import { can, type Capability } from "@/lib/domain/permissions";
import { AppError, ForbiddenError } from "@/lib/errors";

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; code?: string; details?: unknown };

export { AppError };

const CHECK_MESSAGES: Record<string, string> = {
  visits_outcome_chk: "Registra el resultado de la visita para marcarla como realizada.",
  opportunities_lost_reason_chk: "Indica el motivo de pérdida.",
  opportunities_party_chk: "La oportunidad debe estar asociada a un lead o a un cliente.",
  visits_party_chk: "La visita debe estar asociada a un lead o a un cliente.",
  leads_contact_chk: "Ingresa al menos un teléfono o un correo electrónico.",
  leads_budget_chk: "El presupuesto mínimo no puede ser mayor al máximo.",
  clients_budget_chk: "El presupuesto mínimo no puede ser mayor al máximo.",
  leads_area_chk: "El área mínima no puede ser mayor a la máxima.",
  clients_area_chk: "El área mínima no puede ser mayor a la máxima.",
};

interface PgLikeError {
  code?: string;
  message?: string;
  constraint?: string;
  constraint_name?: string;
  detail?: string;
}

export function describeError(err: unknown): { message: string; fieldErrors?: Record<string, string[]>; code?: string; details?: unknown } {
  if (err instanceof AppError) return { message: err.message, fieldErrors: err.fieldErrors, code: err.code, details: err.details };
  if (err instanceof ForbiddenError) return { message: err.message };
  if (err instanceof z.ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { message: "Revisa los campos marcados.", fieldErrors };
  }
  const e = err as PgLikeError;
  const constraint = e.constraint ?? e.constraint_name;
  switch (e.code) {
    case "42501":
      return { message: "No tienes permiso para realizar esta acción." };
    case "23503":
      return { message: "No se puede completar: el registro está relacionado con otros datos (visitas, oportunidades…)." };
    case "23505":
      return { message: constraint?.includes("code") ? "Ya existe una propiedad con ese código." : "Ya existe un registro con estos datos." };
    case "23514":
      return { message: (constraint && CHECK_MESSAGES[constraint]) ?? "Los datos no cumplen las reglas de validación." };
    case "22P02":
    case "22007":
    case "22003":
      return { message: "Hay un valor con formato inválido." };
    default:
      if (e.message?.includes("row-level security")) return { message: "No tienes permiso para realizar esta acción." };
      console.error("[action] error no controlado:", err);
      return { message: "Ocurrió un error inesperado. Inténtalo nuevamente." };
  }
}

interface ActionContext {
  session: SessionUser;
  db: Db;
}

export interface ActionOptions<S extends z.ZodType, O> {
  schema: S;
  capability?: Capability;
  /** Se mantiene por compatibilidad; todas las mutaciones invalidan el layout raíz. */
  revalidate?: string[] | ((out: O, input: z.output<S>) => string[]);
  successMessage?: string | ((out: O) => string);
  handler: (ctx: ActionContext, input: z.output<S>) => Promise<O>;
}

/**
 * Crea una server action tipada: autentica, autoriza por capacidad, valida con Zod,
 * ejecuta el handler en una transacción bajo RLS y normaliza errores.
 */
export function defineAction<S extends z.ZodType, O = void>(opts: ActionOptions<S, O>) {
  return async (raw: z.input<S>): Promise<ActionResult<O>> => {
    try {
      const session = await getSession();
      if (!session) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
      if (opts.capability && !can(session.role, opts.capability)) {
        return { ok: false, error: "No tienes permiso para realizar esta acción." };
      }
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        const { message, fieldErrors } = describeError(parsed.error);
        return { ok: false, error: message, fieldErrors };
      }
      const data = await withUser({ id: session.id, email: session.email }, (db) =>
        opts.handler({ session, db }, parsed.data),
      );
      // Todas las pantallas son dinámicas: invalidar el layout mantiene listas, detalles y métricas coherentes
      revalidatePath("/", "layout");
      const message = typeof opts.successMessage === "function" ? opts.successMessage(data) : opts.successMessage;
      return { ok: true, data, message };
    } catch (err) {
      unstable_rethrow(err);
      const { message, fieldErrors, code, details } = describeError(err);
      return { ok: false, error: message, fieldErrors, code, details };
    }
  };
}

/**
 * Acción administrativa: exige una capacidad (si se indica) y ejecuta el handler con privilegios de servicio
 * (sin RLS) pero conservando al usuario como autor en la auditoría. Se usa solo donde RLS no alcanza
 * (alta de usuarios de autenticación).
 */
export function defineAdminAction<S extends z.ZodType, O = void>(opts: ActionOptions<S, O>) {
  return async (raw: z.input<S>): Promise<ActionResult<O>> => {
    try {
      const session = await getSession();
      if (!session) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
      if (opts.capability && !can(session.role, opts.capability)) return { ok: false, error: "No tienes permiso para realizar esta acción." };
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        const { message, fieldErrors } = describeError(parsed.error);
        return { ok: false, error: message, fieldErrors };
      }
      const data = await withAdminAs({ id: session.id, email: session.email }, (db) => opts.handler({ session, db }, parsed.data));
      revalidatePath("/", "layout");
      const message = typeof opts.successMessage === "function" ? opts.successMessage(data) : opts.successMessage;
      return { ok: true, data, message };
    } catch (err) {
      unstable_rethrow(err);
      const { message, fieldErrors, code, details } = describeError(err);
      return { ok: false, error: message, fieldErrors, code, details };
    }
  };
}

/**
 * Variante sin esquema Zod para acciones con FormData (subida de archivos):
 * mismo manejo de sesión, permisos, transacción bajo RLS y errores.
 */
export async function runAction<T>(
  fn: (ctx: ActionContext) => Promise<T>,
  opts: { capability?: Capability; successMessage?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    if (opts.capability && !can(session.role, opts.capability)) return { ok: false, error: "No tienes permiso para realizar esta acción." };
    const data = await withUser({ id: session.id, email: session.email }, (db) => fn({ session, db }));
    revalidatePath("/", "layout");
    return { ok: true, data, message: opts.successMessage };
  } catch (err) {
    unstable_rethrow(err);
    const { message, fieldErrors, code, details } = describeError(err);
    return { ok: false, error: message, fieldErrors, code, details };
  }
}
