/**
 * Eventos de sistema que alimentan la línea de tiempo comercial.
 * Se guardan como activities (type = 'system', event = <clave>).
 */
export type SystemEvent =
  | "lead_created"
  | "assigned"
  | "stage_changed"
  | "qualified"
  | "property_sent"
  | "visit_scheduled"
  | "visit_confirmed"
  | "visit_completed"
  | "visit_cancelled"
  | "visit_no_show"
  | "visit_rescheduled"
  | "opportunity_created"
  | "opportunity_stage"
  | "negotiation_started"
  | "reserved"
  | "won"
  | "lost"
  | "reactivated"
  | "converted"
  | "client_created"
  | "merged"
  | "tags_changed"
  | "property_listed"
  | "price_changed"
  | "property_status"
  | "task_completed";

export interface EventMeta {
  from?: string | null;
  to?: string | null;
  code?: string | null;
  source?: string | null;
  value?: string | null;
  reason?: string | null;
  outcome?: string | null;
  name?: string | null;
  tasks?: string | null;
}

export function eventTitle(event: SystemEvent | string, m: EventMeta = {}): string {
  switch (event) {
    case "lead_created":
      return "Lead creado";
    case "assigned":
      if (m.from && m.to) return `Reasignado de ${m.from} a ${m.to}`;
      return m.to ? `Asignado a ${m.to}` : "Lead sin vendedor asignado";
    case "stage_changed":
      return `Etapa: ${m.from ?? "—"} → ${m.to ?? "—"}`;
    case "qualified":
      return "Lead calificado";
    case "property_sent":
      return `Propiedad enviada${m.code ? `: ${m.code}` : ""}`;
    case "visit_scheduled":
      return `Visita programada${m.code ? ` · ${m.code}` : ""}`;
    case "visit_confirmed":
      return `Visita confirmada${m.code ? ` · ${m.code}` : ""}`;
    case "visit_completed":
      return `Visita realizada${m.code ? ` · ${m.code}` : ""}`;
    case "visit_cancelled":
      return `Visita cancelada${m.code ? ` · ${m.code}` : ""}`;
    case "visit_no_show":
      return `El cliente no asistió${m.code ? ` · ${m.code}` : ""}`;
    case "visit_rescheduled":
      return `Visita reprogramada${m.code ? ` · ${m.code}` : ""}`;
    case "opportunity_created":
      return `Oportunidad creada${m.code ? ` · ${m.code}` : ""}`;
    case "opportunity_stage":
      return `Oportunidad: ${m.from ?? "—"} → ${m.to ?? "—"}`;
    case "negotiation_started":
      return `Negociación iniciada${m.code ? ` · ${m.code}` : ""}`;
    case "reserved":
      return `Reserva / separación${m.code ? ` · ${m.code}` : ""}`;
    case "won":
      return `Cierre ganado${m.value ? ` · ${m.value}` : ""}`;
    case "lost":
      return `Marcado como perdido${m.reason ? ` · ${m.reason}` : ""}`;
    case "reactivated":
      return "Lead reactivado";
    case "converted":
      return "Convertido en cliente";
    case "client_created":
      return "Cliente registrado";
    case "merged":
      return `Lead duplicado fusionado${m.name ? `: ${m.name}` : ""}`;
    case "tags_changed":
      return "Etiquetas actualizadas";
    case "property_listed":
      return `Propiedad captada${m.code ? `: ${m.code}` : ""}`;
    case "price_changed":
      return `Precio actualizado: ${m.from ?? "—"} → ${m.to ?? "—"}`;
    case "property_status":
      return `Estado de la propiedad: ${m.from ?? "—"} → ${m.to ?? "—"}`;
    case "task_completed":
      return `Tarea completada${m.name ? `: ${m.name}` : ""}`;
    default:
      return event;
  }
}

/** Clave de deduplicación para notificaciones (la comparten seed, servicios y alertas). */
export const notifKey = {
  leadAssigned: (leadId: string, userId: string) => `lead_assigned:${leadId}:${userId}`,
  taskOverdue: (taskId: string) => `task_overdue:${taskId}`,
  visitSoon: (visitId: string) => `visit_soon:${visitId}`,
  visitCancelled: (visitId: string) => `visit_cancelled:${visitId}`,
  oppStalled: (oppId: string, week: string) => `opp_stalled:${oppId}:${week}`,
  followUpOverdue: (leadId: string, dueIso: string) => `follow_up_overdue:${leadId}:${dueIso.slice(0, 10)}`,
  propertyReserved: (propertyId: string, oppId: string) => `property_reserved:${propertyId}:${oppId}`,
  clientNew: (clientId: string) => `client_new:${clientId}`,
  oppNew: (oppId: string) => `opp_new:${oppId}`,
};
