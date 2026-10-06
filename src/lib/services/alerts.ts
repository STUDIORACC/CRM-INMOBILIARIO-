import type { Db } from "@/lib/db/types";
import { notifKey } from "@/lib/domain/events";
import { APP_TZ } from "@/lib/domain/dates";

export interface Thresholds {
  leadIdleDays: number;
  oppDays: number;
  clientIdleDays: number;
  firstResponseH: number;
  notify: Record<string, boolean>;
}

export async function loadThresholds(db: Db): Promise<Thresholds> {
  const r = await db.one<{
    alert_lead_idle_days: number;
    alert_opportunity_days: number;
    alert_client_idle_days: number;
    alert_first_response_h: number;
    notify_settings: Record<string, boolean>;
  }>("select alert_lead_idle_days, alert_opportunity_days, alert_client_idle_days, alert_first_response_h, notify_settings from public.company_settings where id = 1");
  return {
    leadIdleDays: r?.alert_lead_idle_days ?? 5,
    oppDays: r?.alert_opportunity_days ?? 7,
    clientIdleDays: r?.alert_client_idle_days ?? 30,
    firstResponseH: r?.alert_first_response_h ?? 2,
    notify: r?.notify_settings ?? {},
  };
}

export type LeadAlertKey = "uncontacted" | "idle" | "overdue_follow_up" | "hot_no_followup" | "unassigned" | "upcoming_visit";

export const LEAD_ALERT_LABELS: Record<LeadAlertKey, string> = {
  uncontacted: "Sin contactar",
  idle: "Sin actividad reciente",
  overdue_follow_up: "Seguimiento vencido",
  hot_no_followup: "Calientes sin seguimiento",
  unassigned: "Sin vendedor asignado",
  upcoming_visit: "Con visita próxima",
};

const int = (n: number) => Math.max(1, Math.trunc(n));

/** Condición SQL (alias `l`) de cada alerta de leads; se comparte entre alertas y filtros de la lista. */
export function leadAlertSql(key: LeadAlertKey, t: Thresholds): string {
  const open = "l.stage not in ('won', 'lost')";
  switch (key) {
    case "uncontacted":
      return `(l.stage = 'new' and l.first_contacted_at is null and l.created_at < now() - interval '${int(t.firstResponseH)} hours')`;
    case "idle":
      return `(${open} and coalesce(l.last_activity_at, l.created_at) < now() - interval '${int(t.leadIdleDays)} days')`;
    case "overdue_follow_up":
      return `(${open} and l.next_follow_up_at is not null and l.next_follow_up_at < now())`;
    case "hot_no_followup":
      return `(${open} and l.score > 60 and l.next_follow_up_at is null)`;
    case "unassigned":
      return `(${open} and l.assigned_to is null)`;
    case "upcoming_visit":
      return `exists (select 1 from public.visits v where v.lead_id = l.id and v.status in ('scheduled', 'confirmed') and v.scheduled_at between now() and now() + interval '48 hours')`;
  }
}

export interface AlertItem {
  key: string;
  severity: "danger" | "warning" | "info";
  count: number;
  message: string;
  href: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Alertas accionables para el dashboard. `ownerId` limita al trabajo propio (asesores).
 */
export async function getAlerts(db: Db, ownerId?: string | null): Promise<AlertItem[]> {
  const t = await loadThresholds(db);
  const o = ownerId ?? null;
  const row = await db.one<Record<string, number>>(
    `select
      (select count(*) from public.leads l where ${leadAlertSql("uncontacted", t)} and ($1::uuid is null or l.assigned_to = $1)) as uncontacted,
      (select count(*) from public.leads l where ${leadAlertSql("idle", t)} and ($1::uuid is null or l.assigned_to = $1)) as idle,
      (select count(*) from public.leads l where ${leadAlertSql("overdue_follow_up", t)} and ($1::uuid is null or l.assigned_to = $1)) as overdue_follow_up,
      (select count(*) from public.leads l where ${leadAlertSql("hot_no_followup", t)} and ($1::uuid is null or l.assigned_to = $1)) as hot_no_followup,
      (select count(*) from public.leads l where ${leadAlertSql("unassigned", t)}) as unassigned,
      (select count(*) from public.visits v where v.status in ('scheduled', 'confirmed') and v.scheduled_at between now() and now() + interval '48 hours' and ($1::uuid is null or v.advisor_id = $1)) as visits_soon,
      (select count(*) from public.visits v where v.status = 'scheduled'
          and v.scheduled_at >= date_trunc('day', (now() at time zone '${APP_TZ}') + interval '1 day') at time zone '${APP_TZ}'
          and v.scheduled_at <  date_trunc('day', (now() at time zone '${APP_TZ}') + interval '2 day') at time zone '${APP_TZ}'
          and ($1::uuid is null or v.advisor_id = $1)) as visits_tomorrow_unconfirmed,
      (select count(*) from public.visits v where v.status in ('scheduled', 'confirmed') and v.scheduled_at < now() - interval '1 hour' and ($1::uuid is null or v.advisor_id = $1)) as visits_pending_result,
      (select count(*) from public.tasks k where k.status in ('pending', 'in_progress') and k.due_at < now() and ($1::uuid is null or k.assigned_to = $1)) as tasks_overdue,
      (select count(*) from public.opportunities op join public.pipeline_stages s on s.key = op.stage
         where s.kind = 'open' and coalesce(op.last_activity_at, op.created_at) < now() - interval '${int(t.oppDays)} days'
           and ($1::uuid is null or op.assigned_to = $1)) as opps_stalled,
      (select count(*) from public.clients c where c.status = 'active'
         and coalesce(c.last_activity_at, c.created_at) < now() - interval '${int(t.clientIdleDays)} days'
         and ($1::uuid is null or c.assigned_to = $1)) as clients_idle`,
    [o],
  );
  const n = (k: string) => Number(row?.[k] ?? 0);
  const items: AlertItem[] = [];
  const push = (a: AlertItem) => a.count > 0 && items.push(a);

  push({ key: "tasks_overdue", severity: "danger", count: n("tasks_overdue"), message: `${plural(n("tasks_overdue"), "tarea vencida", "tareas vencidas")} por completar.`, href: "/tasks?tab=overdue" });
  push({ key: "visits_pending_result", severity: "danger", count: n("visits_pending_result"), message: `${plural(n("visits_pending_result"), "visita", "visitas")} sin resultado registrado.`, href: "/visits?pending=1" });
  push({ key: "hot_no_followup", severity: "danger", count: n("hot_no_followup"), message: `${plural(n("hot_no_followup"), "lead caliente no tiene", "leads calientes no tienen")} seguimiento programado.`, href: "/leads?alert=hot_no_followup" });
  push({ key: "overdue_follow_up", severity: "warning", count: n("overdue_follow_up"), message: `${plural(n("overdue_follow_up"), "lead tiene", "leads tienen")} el seguimiento vencido.`, href: "/leads?alert=overdue_follow_up" });
  push({ key: "uncontacted", severity: "warning", count: n("uncontacted"), message: `${plural(n("uncontacted"), "lead sin contactar", "leads sin contactar")} (más de ${t.firstResponseH} h desde su ingreso).`, href: "/leads?alert=uncontacted" });
  if (!o) push({ key: "unassigned", severity: "warning", count: n("unassigned"), message: `${plural(n("unassigned"), "lead sin vendedor asignado", "leads sin vendedor asignado")}.`, href: "/leads?alert=unassigned" });
  push({ key: "opps_stalled", severity: "warning", count: n("opps_stalled"), message: `${plural(n("opps_stalled"), "oportunidad lleva", "oportunidades llevan")} más de ${t.oppDays} días sin actividad.`, href: "/opportunities?stalled=1" });
  push({ key: "visits_tomorrow_unconfirmed", severity: "info", count: n("visits_tomorrow_unconfirmed"), message: `${plural(n("visits_tomorrow_unconfirmed"), "visita de mañana", "visitas de mañana")} pendiente${n("visits_tomorrow_unconfirmed") === 1 ? "" : "s"} de confirmar.`, href: "/visits?status=scheduled&range=tomorrow" });
  push({ key: "idle", severity: "info", count: n("idle"), message: `${plural(n("idle"), "lead sin actividad", "leads sin actividad")} en los últimos ${t.leadIdleDays} días.`, href: "/leads?alert=idle" });
  push({ key: "clients_idle", severity: "info", count: n("clients_idle"), message: `${plural(n("clients_idle"), "cliente sin actividad", "clientes sin actividad")} en más de ${t.clientIdleDays} días.`, href: "/clients?idle=1" });
  return items;
}

/**
 * Genera notificaciones por condiciones de tiempo (tarea vencida, visita próxima,
 * oportunidad estancada…). Es idempotente gracias a dedupe_key y se ejecuta como
 * tarea del sistema (cron) o de forma perezosa al entrar a la app.
 */
export async function syncAlertNotifications(db: Db, opts: { now?: Date; force?: boolean; minIntervalMin?: number } = {}): Promise<number> {
  if (!opts.force) {
    const last = await db.scalar<string>("select alerts_synced_at from public.company_settings where id = 1");
    const min = opts.minIntervalMin ?? 10;
    if (last && Date.now() - new Date(last).getTime() < min * 60_000) return 0;
  }
  const t = await loadThresholds(db);
  const on = (k: string) => t.notify[k] !== false;
  let inserted = 0;

  const run = async (sql: string, params: unknown[] = []) => {
    const rows = await db.query<{ id: string }>(`${sql} on conflict (user_id, dedupe_key) do nothing returning id`, params as never[]);
    inserted += rows.length;
  };

  if (on("task_overdue") || on("follow_up_overdue")) {
    await run(
      `insert into public.notifications (user_id, type, title, body, href, entity_type, entity_id, dedupe_key, created_at)
       select k.assigned_to,
              case when k.lead_id is not null and k.kind in ('follow_up', 'call', 'whatsapp') then 'follow_up_overdue' else 'task_overdue' end,
              case when k.lead_id is not null and k.kind in ('follow_up', 'call', 'whatsapp') then 'Seguimiento vencido: ' else 'Tarea vencida: ' end || k.title,
              'Venció ' || to_char(k.due_at at time zone '${APP_TZ}', 'DD/MM HH24:MI'),
              case when k.opportunity_id is not null then '/opportunities/' || k.opportunity_id
                   when k.lead_id is not null then '/leads/' || k.lead_id
                   when k.client_id is not null then '/clients/' || k.client_id else '/tasks' end,
              'task', k.id, 'task_overdue:' || k.id, least(now(), k.due_at + interval '1 hour')
         from public.tasks k
        where k.status in ('pending', 'in_progress') and k.due_at < now() - interval '30 minutes' and k.due_at > now() - interval '14 days'
          and ((k.lead_id is not null and k.kind in ('follow_up', 'call', 'whatsapp') and ${on("follow_up_overdue")})
               or ((k.lead_id is null or k.kind not in ('follow_up', 'call', 'whatsapp')) and ${on("task_overdue")}))`,
    );
  }

  if (on("visit_upcoming")) {
    await run(
      `insert into public.notifications (user_id, type, title, body, href, entity_type, entity_id, dedupe_key, created_at)
       select v.advisor_id, 'visit_upcoming',
              'Visita próxima: ' || p.code || ' · ' || coalesce(l.full_name, c.full_name, 'Cliente'),
              to_char(v.scheduled_at at time zone '${APP_TZ}', 'DD/MM HH24:MI') || ' · ' || p.title,
              '/visits', 'visit', v.id, 'visit_soon:' || v.id, least(now(), v.scheduled_at - interval '20 hours')
         from public.visits v
         join public.properties p on p.id = v.property_id
         left join public.leads l on l.id = v.lead_id
         left join public.clients c on c.id = v.client_id
        where v.status in ('scheduled', 'confirmed') and v.scheduled_at between now() and now() + interval '24 hours'`,
    );
  }

  if (on("opportunity_stalled")) {
    await run(
      `insert into public.notifications (user_id, type, title, body, href, entity_type, entity_id, dedupe_key, created_at)
       select o.assigned_to, 'opportunity_stalled',
              'Oportunidad sin actividad: ' || coalesce(l.full_name, c.full_name, 'Cliente') || ' · ' || p.code,
              'Sin movimiento desde hace ' || extract(day from now() - coalesce(o.last_activity_at, o.created_at))::int || ' días',
              '/opportunities/' || o.id, 'opportunity', o.id,
              'opp_stalled:' || o.id || ':' || to_char(now(), 'IYYY-IW'), now() - interval '1 hour'
         from public.opportunities o
         join public.pipeline_stages s on s.key = o.stage and s.kind = 'open'
         join public.properties p on p.id = o.property_id
         left join public.leads l on l.id = o.lead_id
         left join public.clients c on c.id = o.client_id
        where coalesce(o.last_activity_at, o.created_at) < now() - interval '${int(t.oppDays)} days'`,
    );
  }

  await db.query("update public.company_settings set alerts_synced_at = now() where id = 1");
  return inserted;
}

export { notifKey };

/** Conteo de cada alerta de leads (chips de la lista de leads). */
export async function leadAlertCounts(db: Db): Promise<Record<LeadAlertKey, number>> {
  const t = await loadThresholds(db);
  const keys = Object.keys(LEAD_ALERT_LABELS) as LeadAlertKey[];
  const row = await db.one<Record<string, number>>(
    `select ${keys.map((k) => `(select count(*) from public.leads l where ${leadAlertSql(k, t)})::int as ${k}`).join(", ")}`,
  );
  return Object.fromEntries(keys.map((k) => [k, Number(row?.[k] ?? 0)])) as Record<LeadAlertKey, number>;
}
