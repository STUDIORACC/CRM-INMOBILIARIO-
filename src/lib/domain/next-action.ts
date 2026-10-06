import { dayLabel, daysSince, fmtTime } from "./dates";

export type ActionTone = "danger" | "warning" | "ok" | "muted";

export interface NextAction {
  /** Qué debe hacer el vendedor ahora. */
  text: string;
  /** Cuándo (si aplica). */
  when?: string;
  tone: ActionTone;
  /** Mensaje de contexto (p. ej. "caliente y 3 días sin seguimiento"). */
  hint?: string;
}

interface LeadLike {
  stage: string;
  temperature: string;
  score: number;
  next_follow_up_at: string | null;
  next_follow_up_title: string | null;
  last_activity_at: string | null;
  created_at: string;
  first_contacted_at?: string | null;
  assigned_to: string | null;
  lost_reason?: string | null;
}

/**
 * El CRM debe empujar a la acción: calcula la "próxima acción" de un lead a partir de su estado.
 */
export function leadNextAction(l: LeadLike, now: Date = new Date()): NextAction {
  if (l.stage === "won") return { text: "Operación cerrada", tone: "ok" };
  if (l.stage === "lost") return { text: "Lead perdido", tone: "muted", hint: "Puedes reactivarlo si vuelve a mostrar interés." };

  const hot = l.temperature === "hot" || l.temperature === "very_hot";
  const idle = daysSince(l.last_activity_at ?? l.created_at, now) ?? 0;

  if (!l.assigned_to) return { text: "Asignar un vendedor", tone: "danger", hint: "El lead no tiene vendedor responsable." };

  if (l.next_follow_up_at) {
    const due = new Date(l.next_follow_up_at);
    const title = l.next_follow_up_title ?? "Seguimiento";
    if (due.getTime() < now.getTime()) {
      return { text: title, when: `Vencido · ${dayLabel(l.next_follow_up_at)} ${fmtTime(l.next_follow_up_at)}`, tone: "danger", hint: hot ? "Es un lead caliente: atiéndelo cuanto antes." : undefined };
    }
    return { text: title, when: `${dayLabel(l.next_follow_up_at)} ${fmtTime(l.next_follow_up_at)}`, tone: "ok" };
  }

  if (l.stage === "new" && !l.first_contacted_at) {
    return { text: "Contactar al lead", when: "Hoy", tone: "danger", hint: "Aún no se le ha contactado: responder rápido multiplica la conversión." };
  }
  if (hot) {
    return {
      text: "Programar seguimiento",
      tone: "danger",
      hint: `Este lead está ${l.temperature === "very_hot" ? "muy caliente" : "caliente"}${idle > 0 ? ` y lleva ${idle} ${idle === 1 ? "día" : "días"} sin seguimiento` : " y no tiene seguimiento programado"}.`,
    };
  }
  if (idle >= 5) return { text: "Retomar contacto", tone: "warning", hint: `Sin actividad desde hace ${idle} días.` };
  return { text: "Programar el siguiente paso", tone: "muted", hint: "No hay seguimientos programados." };
}
