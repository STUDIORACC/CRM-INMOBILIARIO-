import type { Db } from "@/lib/db/types";

export type CalendarKind = "visit" | "task" | "follow_up" | "call" | "meeting";

export interface CalendarEvent {
  id: string;
  source: "visit" | "task";
  kind: CalendarKind;
  title: string;
  subtitle: string | null;
  start: string;
  end: string;
  status: string;
  advisorId: string;
  leadId: string | null;
  clientId: string | null;
  opportunityId: string | null;
  propertyId: string | null;
  propertyCode: string | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  partyName: string | null;
  partyPhone: string | null;
  overdue: boolean;
}

const KIND_OF_TASK: Record<string, CalendarKind> = { call: "call", whatsapp: "call", meeting: "meeting", follow_up: "follow_up", visit: "task", send_properties: "task", document: "task", other: "task" };

/** Visitas, tareas, seguimientos, llamadas y reuniones del rango, opcionalmente de un vendedor. */
export async function calendarEvents(db: Db, fromIso: string, toIso: string, advisorId?: string | null): Promise<CalendarEvent[]> {
  const [visits, tasks] = await Promise.all([
    db.query<{
      id: string; scheduled_at: string; duration_min: number; status: string; advisor_id: string; lead_id: string | null; client_id: string | null; opportunity_id: string | null;
      property_id: string; code: string; title: string; address: string | null; party: string; phone: string | null; past_due: boolean;
    }>(
      `select v.id, v.scheduled_at, v.duration_min, v.status, v.advisor_id, v.lead_id, v.client_id, v.opportunity_id, v.property_id, p.code, p.title, p.address,
              coalesce(l.full_name, c.full_name, 'Cliente') as party, coalesce(l.phone, c.phone) as phone,
              (v.status in ('scheduled', 'confirmed') and v.scheduled_at + (v.duration_min || ' minutes')::interval < now()) as past_due
         from public.visits v join public.properties p on p.id = v.property_id
         left join public.leads l on l.id = v.lead_id left join public.clients c on c.id = v.client_id
        where v.scheduled_at >= $1::timestamptz and v.scheduled_at < $2::timestamptz and v.status not in ('rescheduled')
          and ($3::uuid is null or v.advisor_id = $3::uuid)
        order by v.scheduled_at limit 600`,
      [fromIso, toIso, advisorId ?? null],
    ),
    db.query<{
      id: string; title: string; kind: string; due_at: string; status: string; assigned_to: string; lead_id: string | null; client_id: string | null; opportunity_id: string | null;
      property_id: string | null; code: string | null; party: string | null; phone: string | null; overdue: boolean;
    }>(
      `select k.id, k.title, k.kind, k.due_at, k.status, k.assigned_to, k.lead_id, k.client_id, k.opportunity_id, k.property_id, p.code,
              coalesce(l.full_name, c.full_name) as party, coalesce(l.phone, c.phone) as phone,
              (k.status in ('pending', 'in_progress') and k.due_at < now()) as overdue
         from public.tasks k left join public.properties p on p.id = k.property_id
         left join public.leads l on l.id = k.lead_id left join public.clients c on c.id = k.client_id
        where k.due_at >= $1::timestamptz and k.due_at < $2::timestamptz and k.status <> 'cancelled'
          and ($3::uuid is null or k.assigned_to = $3::uuid)
        order by k.due_at limit 800`,
      [fromIso, toIso, advisorId ?? null],
    ),
  ]);

  const events: CalendarEvent[] = [];
  for (const v of visits) {
    const end = new Date(new Date(v.scheduled_at).getTime() + v.duration_min * 60_000).toISOString();
    events.push({
      id: v.id, source: "visit", kind: "visit", title: `${v.party}`, subtitle: `${v.code} · ${v.title}`, start: v.scheduled_at, end, status: v.status, advisorId: v.advisor_id,
      leadId: v.lead_id, clientId: v.client_id, opportunityId: v.opportunity_id, propertyId: v.property_id, propertyCode: v.code, propertyTitle: v.title, propertyAddress: v.address,
      partyName: v.party, partyPhone: v.phone, overdue: v.past_due,
    });
  }
  for (const k of tasks) {
    const end = new Date(new Date(k.due_at).getTime() + 30 * 60_000).toISOString();
    events.push({
      id: k.id, source: "task", kind: KIND_OF_TASK[k.kind] ?? "task", title: k.title, subtitle: k.party, start: k.due_at, end, status: k.status === "completed" ? "completed" : k.overdue ? "overdue" : k.status, advisorId: k.assigned_to,
      leadId: k.lead_id, clientId: k.client_id, opportunityId: k.opportunity_id, propertyId: k.property_id, propertyCode: k.code, propertyTitle: null, propertyAddress: null,
      partyName: k.party, partyPhone: k.phone, overdue: k.overdue,
    });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}
