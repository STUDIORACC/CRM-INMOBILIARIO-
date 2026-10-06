import type { Db } from "@/lib/db/types";
import { APP_TZ, defaultGranularity, type ResolvedPeriod } from "@/lib/domain/dates";
import type { Currency } from "@/lib/domain/constants";
import { getAlerts, loadThresholds, type AlertItem } from "./alerts";

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
}

export interface DashboardParams {
  period: ResolvedPeriod;
  /** Limita todo al trabajo de un vendedor (dashboard del asesor o filtro del gerente). */
  ownerId: string | null;
  /** Usuario que consulta (para "mis tareas de hoy"). */
  viewerId: string;
  currency: Currency;
  usdRate: number;
}

export interface Kpi {
  value: number;
  prev: number;
}

export interface DashboardData {
  kpis: {
    newLeads: Kpi;
    activeLeads: number;
    openOpportunities: { count: number; value: number; weighted: number };
    upcomingVisits: number;
    visitsDone: Kpi;
    negotiations: { count: number; value: number };
    closedDeals: Kpi;
    closedValue: Kpi;
    conversion: Kpi;
    avgCloseDays: Kpi;
  };
  leadsSeries: { day: SeriesPoint[]; week: SeriesPoint[]; month: SeriesPoint[] };
  funnel: Array<{ stage: string; count: number }>;
  lostLeads: number;
  salesByAdvisor: Array<{ id: string; name: string; count: number; value: number }>;
  leadsBySource: Array<{ key: string; count: number; won: number; conversion: number }>;
  conversionByAdvisor: Array<{ id: string; name: string; leads: number; won: number; conversion: number }>;
  topInquired: Array<{ id: string; code: string; title: string; count: number }>;
  topVisited: Array<{ id: string; code: string; title: string; count: number }>;
  activity: {
    granularity: "day" | "week" | "month";
    series: Array<{ key: string; label: string; calls: number; messages: number; visits: number; tasks: number }>;
    totals: { calls: number; messages: number; visits: number; tasksCompleted: number; pendingFollowUps: number };
  };
  recent: RecentEvent[];
  alerts: AlertItem[];
  upcoming: UpcomingVisit[];
  todayTasks: TodayTask[];
  hotLeads: HotLead[];
  stalledOpportunities: StalledOpp[];
}

export interface RecentEvent {
  id: string;
  type: string;
  event: string | null;
  title: string;
  occurred_at: string;
  actor: string | null;
  party: string | null;
  href: string | null;
  property_code: string | null;
}

export interface UpcomingVisit {
  id: string;
  scheduled_at: string;
  status: string;
  property_code: string;
  property_title: string;
  party: string;
  party_href: string;
  advisor: string;
  advisor_id: string;
}

export interface TodayTask {
  id: string;
  title: string;
  kind: string;
  due_at: string;
  status: string;
  href: string | null;
  overdue: boolean;
}

export interface HotLead {
  id: string;
  full_name: string;
  score: number;
  temperature: string;
  stage: string;
  next_follow_up_at: string | null;
  last_activity_at: string | null;
  assigned_to: string | null;
  property_code: string | null;
}

export interface StalledOpp {
  id: string;
  party: string;
  property_code: string;
  stage: string;
  value: number;
  currency: Currency;
  days: number;
  assigned_to: string;
}

const tzLit = `'${APP_TZ}'`;

function baseValue(alias: string, col: string, p: DashboardParams): string {
  const rate = Number(p.usdRate) || 1;
  return p.currency === "PEN"
    ? `(case when ${alias}.currency = 'USD' then ${alias}.${col} * ${rate} else ${alias}.${col} end)`
    : `(case when ${alias}.currency = 'PEN' then ${alias}.${col} / ${rate} else ${alias}.${col} end)`;
}

const fmtLabel = (key: string, g: "day" | "week" | "month") => {
  const [y, m, d] = key.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  if (g === "month") return `${months[m - 1]} ${String(y).slice(2)}`;
  return `${d} ${months[m - 1]}`;
};

async function leadSeries(db: Db, p: DashboardParams, g: "day" | "week" | "month"): Promise<SeriesPoint[]> {
  const rows = await db.query<{ key: string; value: number }>(
    `select to_char(b.bucket, 'YYYY-MM-DD') as key, count(l.id)::int as value
       from generate_series(
              date_trunc('${g}', ($1::timestamptz) at time zone ${tzLit}),
              date_trunc('${g}', (($2::timestamptz) - interval '1 second') at time zone ${tzLit}),
              interval '1 ${g}') as b(bucket)
       left join public.leads l
         on date_trunc('${g}', l.created_at at time zone ${tzLit}) = b.bucket
        and l.created_at >= $1::timestamptz and l.created_at < $2::timestamptz
        and ($3::uuid is null or l.assigned_to = $3::uuid)
      group by b.bucket order by b.bucket`,
    [p.period.fromIso, p.period.toIso, p.ownerId],
  );
  return rows.map((r) => ({ key: r.key, label: fmtLabel(r.key, g), value: r.value }));
}

export async function getDashboard(db: Db, p: DashboardParams): Promise<DashboardData> {
  const { period } = p;
  const owner = p.ownerId;
  const thresholds = await loadThresholds(db);
  const oppVal = baseValue("o", "value", p);
  const gran = defaultGranularity(period.days);

  const range = [period.fromIso, period.toIso];
  const prevRange = [period.prevFromIso, period.prevToIso];

  const [
    leadsNow,
    leadsPrev,
    activeLeads,
    openOpps,
    upcomingVisits,
    visitsDone,
    negotiations,
    closed,
    closeDays,
    seriesDay,
    seriesWeek,
    seriesMonth,
    funnelRows,
    lostRows,
    sales,
    sources,
    wonBySource,
    advisorLeads,
    advisorWon,
    inquired,
    visited,
    actRows,
    taskDoneRows,
    pendingFollow,
    recent,
    alerts,
    upcoming,
    todayTasks,
    hotLeads,
    stalled,
  ] = await Promise.all([
    db.scalar<number>(`select count(*) from public.leads l where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or l.assigned_to = $3)`, [...range, owner]),
    db.scalar<number>(`select count(*) from public.leads l where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or l.assigned_to = $3)`, [...prevRange, owner]),
    db.scalar<number>(`select count(*) from public.leads l where l.stage not in ('won', 'lost') and ($1::uuid is null or l.assigned_to = $1)`, [owner]),
    db.one<{ count: number; value: number; weighted: number }>(
      `select count(*)::int as count, coalesce(sum(${oppVal}), 0) as value, coalesce(sum(${oppVal} * o.probability / 100.0), 0) as weighted
         from public.opportunities o join public.pipeline_stages s on s.key = o.stage
        where s.kind = 'open' and ($1::uuid is null or o.assigned_to = $1)`,
      [owner],
    ),
    db.scalar<number>(
      `select count(*) from public.visits v where v.status in ('scheduled', 'confirmed') and v.scheduled_at >= now() and v.scheduled_at < now() + interval '7 days' and ($1::uuid is null or v.advisor_id = $1)`,
      [owner],
    ),
    db.query<{ cur: number; prev: number }>(
      `select count(*) filter (where v.scheduled_at >= $1 and v.scheduled_at < $2)::int as cur,
              count(*) filter (where v.scheduled_at >= $3 and v.scheduled_at < $4)::int as prev
         from public.visits v where v.status = 'completed' and v.scheduled_at >= $3 and v.scheduled_at < $2 and ($5::uuid is null or v.advisor_id = $5)`,
      [...range, ...prevRange, owner],
    ),
    db.one<{ count: number; value: number }>(
      `select count(*)::int as count, coalesce(sum(${oppVal}), 0) as value
         from public.opportunities o where o.stage in ('negotiation', 'reserved') and ($1::uuid is null or o.assigned_to = $1)`,
      [owner],
    ),
    db.one<{ cur: number; prev: number; cur_value: number; prev_value: number }>(
      `select count(*) filter (where o.won_at >= $1 and o.won_at < $2)::int as cur,
              count(*) filter (where o.won_at >= $3 and o.won_at < $4)::int as prev,
              coalesce(sum(${oppVal}) filter (where o.won_at >= $1 and o.won_at < $2), 0) as cur_value,
              coalesce(sum(${oppVal}) filter (where o.won_at >= $3 and o.won_at < $4), 0) as prev_value
         from public.opportunities o where o.stage = 'won' and o.won_at >= $3 and o.won_at < $2 and ($5::uuid is null or o.assigned_to = $5)`,
      [...range, ...prevRange, owner],
    ),
    db.one<{ cur: number | null; prev: number | null }>(
      `select avg(extract(epoch from (o.won_at - coalesce(l.created_at, o.created_at))) / 86400.0) filter (where o.won_at >= $1 and o.won_at < $2) as cur,
              avg(extract(epoch from (o.won_at - coalesce(l.created_at, o.created_at))) / 86400.0) filter (where o.won_at >= $3 and o.won_at < $4) as prev
         from public.opportunities o left join public.leads l on l.id = o.lead_id
        where o.stage = 'won' and o.won_at >= $3 and o.won_at < $2 and ($5::uuid is null or o.assigned_to = $5)`,
      [...range, ...prevRange, owner],
    ),
    leadSeries(db, p, "day"),
    leadSeries(db, p, "week"),
    leadSeries(db, p, "month"),
    db.query<{ stage: string; count: number }>(
      `select sh.stage, count(distinct sh.entity_id)::int as count
         from public.stage_history sh join public.leads l on l.id = sh.entity_id
        where sh.entity_type = 'lead' and sh.entered_at >= $1 and sh.entered_at < $2 and ($3::uuid is null or l.assigned_to = $3)
        group by sh.stage`,
      [...range, owner],
    ),
    db.scalar<number>(
      `select count(distinct sh.entity_id) from public.stage_history sh join public.leads l on l.id = sh.entity_id
        where sh.entity_type = 'lead' and sh.stage = 'lost' and sh.entered_at >= $1 and sh.entered_at < $2 and ($3::uuid is null or l.assigned_to = $3)`,
      [...range, owner],
    ),
    owner
      ? Promise.resolve([] as Array<{ id: string; name: string; count: number; value: number }>)
      : db.query<{ id: string; name: string; count: number; value: number }>(
          `select u.id, u.full_name as name, count(o.id)::int as count, coalesce(sum(${oppVal}), 0) as value
             from public.users u
             left join public.opportunities o on o.assigned_to = u.id and o.stage = 'won' and o.won_at >= $1 and o.won_at < $2
            where u.role in ('advisor', 'manager', 'admin')
            group by u.id, u.full_name, u.role, u.status
           having count(o.id) > 0 or (u.role = 'advisor' and u.status = 'active')
            order by value desc, u.full_name`,
          range,
        ),
    db.query<{ key: string; count: number }>(
      `select l.source as key, count(*)::int as count from public.leads l
        where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or l.assigned_to = $3)
        group by l.source order by count desc`,
      [...range, owner],
    ),
    db.query<{ key: string; won: number }>(
      `select l.source as key, count(distinct o.id)::int as won
         from public.opportunities o join public.leads l on l.id = o.lead_id
        where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2 and ($3::uuid is null or o.assigned_to = $3)
        group by l.source`,
      [...range, owner],
    ),
    owner
      ? Promise.resolve([] as Array<{ id: string; name: string; leads: number }>)
      : db.query<{ id: string; name: string; leads: number }>(
          `select u.id, u.full_name as name, count(l.id)::int as leads
             from public.users u
             left join public.leads l on l.assigned_to = u.id and l.created_at >= $1 and l.created_at < $2
            where u.role in ('advisor', 'manager', 'admin')
            group by u.id, u.full_name, u.role, u.status
           having count(l.id) > 0 or (u.role = 'advisor' and u.status = 'active')`,
          range,
        ),
    owner
      ? Promise.resolve([] as Array<{ id: string; won: number }>)
      : db.query<{ id: string; won: number }>(
          `select o.assigned_to as id, count(*)::int as won from public.opportunities o
            where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2 group by o.assigned_to`,
          range,
        ),
    db.query<{ id: string; code: string; title: string; count: number }>(
      `select pr.id, pr.code, pr.title, count(*)::int as count
         from public.leads l join public.properties pr on pr.id = l.property_id
        where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or l.assigned_to = $3)
        group by pr.id, pr.code, pr.title order by count desc, pr.code limit 5`,
      [...range, owner],
    ),
    db.query<{ id: string; code: string; title: string; count: number }>(
      `select pr.id, pr.code, pr.title, count(*)::int as count
         from public.visits v join public.properties pr on pr.id = v.property_id
        where v.status = 'completed' and v.scheduled_at >= $1 and v.scheduled_at < $2 and ($3::uuid is null or v.advisor_id = $3)
        group by pr.id, pr.code, pr.title order by count desc, pr.code limit 5`,
      [...range, owner],
    ),
    db.query<{ key: string; calls: number; messages: number; visits: number }>(
      `select to_char(date_trunc('${gran}', a.occurred_at at time zone ${tzLit}), 'YYYY-MM-DD') as key,
              count(*) filter (where a.type = 'call')::int as calls,
              count(*) filter (where a.type in ('whatsapp', 'email'))::int as messages,
              count(*) filter (where a.type in ('visit', 'meeting'))::int as visits
         from public.activities a
        where a.type <> 'system' and a.occurred_at >= $1 and a.occurred_at < $2 and ($3::uuid is null or a.user_id = $3)
        group by 1 order by 1`,
      [...range, owner],
    ),
    db.query<{ key: string; tasks: number }>(
      `select to_char(date_trunc('${gran}', k.completed_at at time zone ${tzLit}), 'YYYY-MM-DD') as key, count(*)::int as tasks
         from public.tasks k
        where k.status = 'completed' and k.completed_at >= $1 and k.completed_at < $2 and ($3::uuid is null or k.assigned_to = $3)
        group by 1`,
      [...range, owner],
    ),
    db.scalar<number>(`select count(*) from public.tasks k where k.status in ('pending', 'in_progress') and k.due_at < now() + interval '1 day' and ($1::uuid is null or k.assigned_to = $1)`, [owner]),
    db.query<RecentEvent>(
      `select a.id, a.type, a.event, a.title, a.occurred_at, u.full_name as actor,
              coalesce(l.full_name, c.full_name) as party,
              case when a.lead_id is not null then '/leads/' || a.lead_id
                   when a.client_id is not null then '/clients/' || a.client_id
                   when a.opportunity_id is not null then '/opportunities/' || a.opportunity_id
                   when a.property_id is not null then '/properties/' || a.property_id end as href,
              p.code as property_code
         from public.activities a
         left join public.users u on u.id = a.user_id
         left join public.leads l on l.id = a.lead_id
         left join public.clients c on c.id = a.client_id
         left join public.properties p on p.id = a.property_id
        where (a.type = 'system' or a.type in ('call', 'whatsapp', 'email', 'meeting', 'visit'))
          and a.event is distinct from 'lead_created' and a.event is distinct from 'property_listed'
          and ($1::uuid is null or a.user_id = $1)
        order by a.occurred_at desc limit 12`,
      [owner],
    ),
    getAlerts(db, owner),
    db.query<UpcomingVisit>(
      `select v.id, v.scheduled_at, v.status, p.code as property_code, p.title as property_title,
              coalesce(l.full_name, c.full_name, 'Cliente') as party,
              case when v.lead_id is not null then '/leads/' || v.lead_id else '/clients/' || v.client_id end as party_href,
              u.full_name as advisor, v.advisor_id
         from public.visits v
         join public.properties p on p.id = v.property_id
         join public.users u on u.id = v.advisor_id
         left join public.leads l on l.id = v.lead_id
         left join public.clients c on c.id = v.client_id
        where v.status in ('scheduled', 'confirmed') and v.scheduled_at >= now() - interval '2 hours'
          and ($1::uuid is null or v.advisor_id = $1)
        order by v.scheduled_at limit 6`,
      [owner],
    ),
    db.query<TodayTask>(
      `select k.id, k.title, k.kind, k.due_at, k.status,
              case when k.opportunity_id is not null then '/opportunities/' || k.opportunity_id
                   when k.lead_id is not null then '/leads/' || k.lead_id
                   when k.client_id is not null then '/clients/' || k.client_id end as href,
              (k.due_at < now()) as overdue
         from public.tasks k
        where k.assigned_to = $1 and k.status in ('pending', 'in_progress')
          and k.due_at < date_trunc('day', now() at time zone ${tzLit}) at time zone ${tzLit} + interval '1 day'
        order by k.due_at limit 8`,
      [p.viewerId],
    ),
    db.query<HotLead>(
      `select l.id, l.full_name, l.score, l.temperature, l.stage, l.next_follow_up_at, l.last_activity_at, l.assigned_to, pr.code as property_code
         from public.leads l left join public.properties pr on pr.id = l.property_id
        where l.stage not in ('won', 'lost') and l.score > 60 and ($1::uuid is null or l.assigned_to = $1)
        order by (l.next_follow_up_at is null) desc, l.score desc limit 6`,
      [owner],
    ),
    db.query<StalledOpp>(
      `select o.id, coalesce(l.full_name, c.full_name, 'Cliente') as party, p.code as property_code, o.stage, ${oppVal} as value, 'PEN' as currency,
              floor(extract(epoch from (now() - coalesce(o.last_activity_at, o.created_at))) / 86400)::int as days, o.assigned_to
         from public.opportunities o
         join public.pipeline_stages s on s.key = o.stage and s.kind = 'open'
         join public.properties p on p.id = o.property_id
         left join public.leads l on l.id = o.lead_id
         left join public.clients c on c.id = o.client_id
        where coalesce(o.last_activity_at, o.created_at) < now() - make_interval(days => ${Math.max(1, Math.trunc(thresholds.oppDays))})
          and ($1::uuid is null or o.assigned_to = $1)
        order by days desc limit 5`,
      [owner],
    ),
  ]);

  const newLeads = Number(leadsNow ?? 0);
  const newLeadsPrev = Number(leadsPrev ?? 0);
  const closedNow = closed?.cur ?? 0;
  const closedPrev = closed?.prev ?? 0;

  const stageOrder = ["new", "contacted", "qualified", "opportunity", "visit", "negotiation", "won"];
  const funnel = stageOrder.map((s) => ({ stage: s, count: funnelRows.find((r) => r.stage === s)?.count ?? 0 }));

  const wonMap = new Map(wonBySource.map((r) => [r.key, r.won]));
  const leadsBySource = sources.map((r) => {
    const won = wonMap.get(r.key) ?? 0;
    return { key: r.key, count: r.count, won, conversion: r.count ? Math.min(100, (won / r.count) * 100) : 0 };
  });

  const wonByAdvisor = new Map(advisorWon.map((r) => [r.id, r.won]));
  const conversionByAdvisor = advisorLeads
    .map((a) => {
      const won = wonByAdvisor.get(a.id) ?? 0;
      return { id: a.id, name: a.name, leads: a.leads, won, conversion: a.leads ? Math.min(100, (won / a.leads) * 100) : 0 };
    })
    .sort((a, b) => b.conversion - a.conversion);

  const doneMap = new Map(taskDoneRows.map((r) => [r.key, r.tasks]));
  const actKeys = new Set([...actRows.map((r) => r.key), ...taskDoneRows.map((r) => r.key)]);
  const actSeries = Array.from(actKeys)
    .sort()
    .map((key) => {
      const r = actRows.find((x) => x.key === key);
      return { key, label: fmtLabel(key, gran), calls: r?.calls ?? 0, messages: r?.messages ?? 0, visits: r?.visits ?? 0, tasks: doneMap.get(key) ?? 0 };
    });

  return {
    kpis: {
      newLeads: { value: newLeads, prev: newLeadsPrev },
      activeLeads: Number(activeLeads ?? 0),
      openOpportunities: { count: openOpps?.count ?? 0, value: Number(openOpps?.value ?? 0), weighted: Number(openOpps?.weighted ?? 0) },
      upcomingVisits: Number(upcomingVisits ?? 0),
      visitsDone: { value: visitsDone[0]?.cur ?? 0, prev: visitsDone[0]?.prev ?? 0 },
      negotiations: { count: negotiations?.count ?? 0, value: Number(negotiations?.value ?? 0) },
      closedDeals: { value: closedNow, prev: closedPrev },
      closedValue: { value: Number(closed?.cur_value ?? 0), prev: Number(closed?.prev_value ?? 0) },
      conversion: {
        value: newLeads ? Math.min(100, (closedNow / newLeads) * 100) : 0,
        prev: newLeadsPrev ? Math.min(100, (closedPrev / newLeadsPrev) * 100) : 0,
      },
      avgCloseDays: { value: Number(closeDays?.cur ?? 0), prev: Number(closeDays?.prev ?? 0) },
    },
    leadsSeries: { day: seriesDay, week: seriesWeek, month: seriesMonth },
    funnel,
    lostLeads: Number(lostRows ?? 0),
    salesByAdvisor: sales,
    leadsBySource,
    conversionByAdvisor,
    topInquired: inquired,
    topVisited: visited,
    activity: {
      granularity: gran,
      series: actSeries,
      totals: {
        calls: actSeries.reduce((a, r) => a + r.calls, 0),
        messages: actSeries.reduce((a, r) => a + r.messages, 0),
        visits: actSeries.reduce((a, r) => a + r.visits, 0),
        tasksCompleted: actSeries.reduce((a, r) => a + r.tasks, 0),
        pendingFollowUps: Number(pendingFollow ?? 0),
      },
    },
    recent,
    alerts,
    upcoming,
    todayTasks,
    hotLeads,
    stalledOpportunities: stalled,
  };
}
