import type { Db } from "@/lib/db/types";
import type { Currency } from "@/lib/domain/constants";
import { APP_TZ, defaultGranularity, type ResolvedPeriod } from "@/lib/domain/dates";
import { leadAlertCounts, loadThresholds, type LeadAlertKey } from "./alerts";
import { toCurrencySql } from "./sql-helpers";

export interface ReportParams {
  period: ResolvedPeriod;
  /** Limita a un vendedor (asesores solo ven lo suyo). */
  ownerId: string | null;
  currency: Currency;
  usdRate: number;
}

const tzLit = `'${APP_TZ}'`;
const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const labelOf = (key: string, g: "day" | "week" | "month") => {
  const [y, m, d] = key.split("-").map(Number);
  return g === "month" ? `${months[m - 1]} ${String(y).slice(2)}` : `${d} ${months[m - 1]}`;
};

const num = (v: unknown) => Number(v ?? 0);

// =============================================================================
// Comercial
// =============================================================================
export interface CommercialReport {
  kpis: {
    leads: number;
    leadsPrev: number;
    oppsCreated: number;
    won: number;
    wonPrev: number;
    wonValue: number;
    wonValuePrev: number;
    avgTicket: number;
    lost: number;
    lostValue: number;
    conversion: number;
    avgCloseDays: number | null;
  };
  granularity: "day" | "week" | "month";
  series: Array<{ key: string; label: string; leads: number; won: number; wonValue: number }>;
  byOperation: Array<{ key: string; count: number; value: number }>;
  byType: Array<{ key: string; count: number; value: number }>;
  byDistrict: Array<{ key: string; count: number; value: number }>;
  lossReasons: Array<{ key: string; opportunities: number; leads: number; value: number }>;
  sources: Array<{ key: string; leads: number; won: number; wonValue: number; conversion: number }>;
}

export async function getCommercialReport(db: Db, p: ReportParams): Promise<CommercialReport> {
  const { period: per, ownerId: o } = p;
  const v = toCurrencySql("o", "value", p.currency, p.usdRate);
  const g = defaultGranularity(per.days);
  const r = [per.fromIso, per.toIso];
  const prev = [per.prevFromIso, per.prevToIso];

  const [leads, leadsPrev, oppsCreated, wonRow, lostRow, closeDays, series, byOperation, byType, byDistrict, lossOpp, lossLead, sourceLeads, sourceWon] = await Promise.all([
    db.scalar<number>("select count(*) from public.leads l where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or l.assigned_to = $3)", [...r, o]),
    db.scalar<number>("select count(*) from public.leads l where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or l.assigned_to = $3)", [...prev, o]),
    db.scalar<number>("select count(*) from public.opportunities o where o.created_at >= $1 and o.created_at < $2 and ($3::uuid is null or o.assigned_to = $3)", [...r, o]),
    db.one<{ cur: number; prev: number; cur_value: number; prev_value: number }>(
      `select count(*) filter (where o.won_at >= $1 and o.won_at < $2)::int as cur,
              count(*) filter (where o.won_at >= $3 and o.won_at < $4)::int as prev,
              coalesce(sum(${v}) filter (where o.won_at >= $1 and o.won_at < $2), 0) as cur_value,
              coalesce(sum(${v}) filter (where o.won_at >= $3 and o.won_at < $4), 0) as prev_value
         from public.opportunities o where o.stage = 'won' and o.won_at >= $3 and o.won_at < $2 and ($5::uuid is null or o.assigned_to = $5)`,
      [...r, ...prev, o],
    ),
    db.one<{ count: number; value: number }>(
      `select count(*)::int as count, coalesce(sum(${v}), 0) as value from public.opportunities o
        where o.stage = 'lost' and o.lost_at >= $1 and o.lost_at < $2 and ($3::uuid is null or o.assigned_to = $3)`,
      [...r, o],
    ),
    db.scalar<number | null>(
      `select avg(extract(epoch from (o.won_at - coalesce(l.created_at, o.created_at))) / 86400.0)
         from public.opportunities o left join public.leads l on l.id = o.lead_id
        where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2 and ($3::uuid is null or o.assigned_to = $3)`,
      [...r, o],
    ),
    db.query<{ key: string; leads: number; won: number; won_value: number }>(
      `select to_char(b.bucket, 'YYYY-MM-DD') as key, coalesce(l.n, 0)::int as leads, coalesce(w.n, 0)::int as won, coalesce(w.v, 0) as won_value
         from generate_series(date_trunc('${g}', ($1::timestamptz) at time zone ${tzLit}), date_trunc('${g}', (($2::timestamptz) - interval '1 second') at time zone ${tzLit}), interval '1 ${g}') as b(bucket)
         left join (select date_trunc('${g}', created_at at time zone ${tzLit}) as bk, count(*) as n from public.leads
                     where created_at >= $1 and created_at < $2 and ($3::uuid is null or assigned_to = $3) group by 1) l on l.bk = b.bucket
         left join (select date_trunc('${g}', o.won_at at time zone ${tzLit}) as bk, count(*) as n, sum(${v}) as v from public.opportunities o
                     where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2 and ($3::uuid is null or o.assigned_to = $3) group by 1) w on w.bk = b.bucket
        order by b.bucket`,
      [...r, o],
    ),
    db.query<{ key: string; count: number; value: number }>(
      `select o.operation as key, count(*)::int as count, coalesce(sum(${v}), 0) as value from public.opportunities o
        where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2 and ($3::uuid is null or o.assigned_to = $3) group by 1 order by value desc`,
      [...r, o],
    ),
    db.query<{ key: string; count: number; value: number }>(
      `select pr.property_type as key, count(*)::int as count, coalesce(sum(${v}), 0) as value
         from public.opportunities o join public.properties pr on pr.id = o.property_id
        where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2 and ($3::uuid is null or o.assigned_to = $3) group by 1 order by value desc`,
      [...r, o],
    ),
    db.query<{ key: string; count: number; value: number }>(
      `select pr.district as key, count(*)::int as count, coalesce(sum(${v}), 0) as value
         from public.opportunities o join public.properties pr on pr.id = o.property_id
        where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2 and ($3::uuid is null or o.assigned_to = $3) group by 1 order by value desc limit 8`,
      [...r, o],
    ),
    db.query<{ key: string; count: number; value: number }>(
      `select o.lost_reason as key, count(*)::int as count, coalesce(sum(${v}), 0) as value from public.opportunities o
        where o.stage = 'lost' and o.lost_at >= $1 and o.lost_at < $2 and o.lost_reason is not null and ($3::uuid is null or o.assigned_to = $3) group by 1`,
      [...r, o],
    ),
    db.query<{ key: string; count: number }>(
      `select l.lost_reason as key, count(distinct l.id)::int as count
         from public.leads l join public.stage_history sh on sh.entity_type = 'lead' and sh.entity_id = l.id and sh.stage = 'lost'
        where sh.entered_at >= $1 and sh.entered_at < $2 and l.lost_reason is not null and l.stage = 'lost' and ($3::uuid is null or l.assigned_to = $3) group by 1`,
      [...r, o],
    ),
    db.query<{ key: string; count: number }>(
      "select l.source as key, count(*)::int as count from public.leads l where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or l.assigned_to = $3) group by 1",
      [...r, o],
    ),
    db.query<{ key: string; won: number; value: number }>(
      `select l.source as key, count(distinct o.id)::int as won, coalesce(sum(${v}), 0) as value
         from public.opportunities o join public.leads l on l.id = o.lead_id
        where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2 and ($3::uuid is null or o.assigned_to = $3) group by 1`,
      [...r, o],
    ),
  ]);

  const won = wonRow?.cur ?? 0;
  const wonValue = num(wonRow?.cur_value);
  const lossKeys = new Set([...lossOpp.map((x) => x.key), ...lossLead.map((x) => x.key)]);
  const wonBySource = new Map(sourceWon.map((s) => [s.key, s]));
  const nLeads = num(leads);

  return {
    kpis: {
      leads: nLeads,
      leadsPrev: num(leadsPrev),
      oppsCreated: num(oppsCreated),
      won,
      wonPrev: wonRow?.prev ?? 0,
      wonValue,
      wonValuePrev: num(wonRow?.prev_value),
      avgTicket: won ? wonValue / won : 0,
      lost: lostRow?.count ?? 0,
      lostValue: num(lostRow?.value),
      conversion: nLeads ? Math.min(100, (won / nLeads) * 100) : 0,
      avgCloseDays: closeDays == null ? null : num(closeDays),
    },
    granularity: g,
    series: series.map((s) => ({ key: s.key, label: labelOf(s.key, g), leads: s.leads, won: s.won, wonValue: num(s.won_value) })),
    byOperation: byOperation.map((x) => ({ ...x, value: num(x.value) })),
    byType: byType.map((x) => ({ ...x, value: num(x.value) })),
    byDistrict: byDistrict.map((x) => ({ ...x, value: num(x.value) })),
    lossReasons: [...lossKeys]
      .map((key) => ({ key, opportunities: lossOpp.find((x) => x.key === key)?.count ?? 0, leads: lossLead.find((x) => x.key === key)?.count ?? 0, value: num(lossOpp.find((x) => x.key === key)?.value) }))
      .sort((a, b) => b.opportunities + b.leads - (a.opportunities + a.leads)),
    sources: sourceLeads
      .map((s) => {
        const w = wonBySource.get(s.key);
        return { key: s.key, leads: s.count, won: w?.won ?? 0, wonValue: num(w?.value), conversion: s.count ? Math.min(100, ((w?.won ?? 0) / s.count) * 100) : 0 };
      })
      .sort((a, b) => b.leads - a.leads),
  };
}

// =============================================================================
// Pipeline (foto actual + tiempos por etapa del periodo)
// =============================================================================
export interface PipelineReport {
  byStage: Array<{ stage: string; count: number; value: number; weighted: number }>;
  timeInStage: Array<{ stage: string; avgDays: number; samples: number }>;
  aging: Array<{ bucket: string; count: number; value: number }>;
  forecast: Array<{ key: string; label: string; count: number; value: number; weighted: number }>;
  top: Array<{ id: string; party: string; property_code: string; stage: string; value: number; weighted: number; probability: number; assigned_to: string; expected_close_date: string | null; days_in_stage: number }>;
  totals: { count: number; value: number; weighted: number };
}

export async function getPipelineReport(db: Db, p: ReportParams): Promise<PipelineReport> {
  const o = p.ownerId;
  const v = toCurrencySql("o", "value", p.currency, p.usdRate);
  const [byStage, timeInStage, aging, forecast, top] = await Promise.all([
    db.query<{ stage: string; count: number; value: number; weighted: number }>(
      `select o.stage, count(*)::int as count, coalesce(sum(${v}), 0) as value, coalesce(sum(${v} * o.probability / 100.0), 0) as weighted
         from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open'
        where ($1::uuid is null or o.assigned_to = $1) group by o.stage, s.position order by s.position`,
      [o],
    ),
    db.query<{ stage: string; avg_days: number; samples: number }>(
      `select sh.stage, avg(extract(epoch from (sh.exited_at - sh.entered_at)) / 86400.0) as avg_days, count(*)::int as samples
         from public.stage_history sh join public.opportunities op on op.id = sh.entity_id
         join public.pipeline_stages s on s.key = sh.stage and s.kind = 'open'
        where sh.entity_type = 'opportunity' and sh.exited_at is not null and sh.entered_at >= $1 and sh.entered_at < $2 and ($3::uuid is null or op.assigned_to = $3)
        group by sh.stage, s.position order by s.position`,
      [p.period.fromIso, p.period.toIso, o],
    ),
    db.query<{ bucket: string; count: number; value: number; ord: number }>(
      `select case when d <= 7 then '0–7 días' when d <= 14 then '8–14 días' when d <= 30 then '15–30 días' when d <= 60 then '31–60 días' else 'Más de 60 días' end as bucket,
              min(case when d <= 7 then 1 when d <= 14 then 2 when d <= 30 then 3 when d <= 60 then 4 else 5 end) as ord,
              count(*)::int as count, coalesce(sum(val), 0) as value
         from (select floor(extract(epoch from (now() - o.stage_changed_at)) / 86400)::int as d, ${v} as val
                 from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open' where ($1::uuid is null or o.assigned_to = $1)) x
        group by 1 order by ord`,
      [o],
    ),
    db.query<{ key: string; count: number; value: number; weighted: number }>(
      `select to_char(date_trunc('month', coalesce(o.expected_close_date, (now() at time zone ${tzLit})::date)), 'YYYY-MM-01') as key,
              count(*)::int as count, coalesce(sum(${v}), 0) as value, coalesce(sum(${v} * o.probability / 100.0), 0) as weighted
         from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open'
        where ($1::uuid is null or o.assigned_to = $1) group by 1 order by 1 limit 8`,
      [o],
    ),
    db.query<PipelineReport["top"][number]>(
      `select o.id, coalesce(l.full_name, c.full_name, 'Cliente') as party, pr.code as property_code, o.stage, ${v} as value, ${v} * o.probability / 100.0 as weighted,
              o.probability, o.assigned_to, to_char(o.expected_close_date, 'YYYY-MM-DD') as expected_close_date,
              floor(extract(epoch from (now() - o.stage_changed_at)) / 86400)::int as days_in_stage
         from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open'
         join public.properties pr on pr.id = o.property_id left join public.leads l on l.id = o.lead_id left join public.clients c on c.id = o.client_id
        where ($1::uuid is null or o.assigned_to = $1) order by weighted desc limit 10`,
      [o],
    ),
  ]);
  const rows = byStage.map((x) => ({ ...x, value: num(x.value), weighted: num(x.weighted) }));
  return {
    byStage: rows,
    timeInStage: timeInStage.map((x) => ({ stage: x.stage, avgDays: num(x.avg_days), samples: x.samples })),
    aging: aging.map((x) => ({ bucket: x.bucket, count: x.count, value: num(x.value) })),
    forecast: forecast.map((f) => {
      const [y, m] = f.key.split("-").map(Number);
      return { key: f.key, label: `${months[m - 1]} ${String(y).slice(2)}`, count: f.count, value: num(f.value), weighted: num(f.weighted) };
    }),
    top: top.map((t) => ({ ...t, value: num(t.value), weighted: num(t.weighted) })),
    totals: { count: rows.reduce((a, r) => a + r.count, 0), value: rows.reduce((a, r) => a + r.value, 0), weighted: rows.reduce((a, r) => a + r.weighted, 0) },
  };
}

// =============================================================================
// Propiedades
// =============================================================================
export interface PropertiesReport {
  byStatus: Array<{ key: string; count: number }>;
  byDistrict: Array<{ key: string; count: number; avgPrice: number }>;
  byType: Array<{ key: string; count: number }>;
  inventoryValue: number;
  daysOnMarket: number | null;
  closedInPeriod: number;
  priceChanges: number;
  withoutPhotos: number;
  topInquired: Array<{ id: string; code: string; title: string; count: number }>;
  topVisited: Array<{ id: string; code: string; title: string; count: number }>;
  stale: Array<{ id: string; code: string; title: string; district: string; days: number; price: number; currency: Currency; advisor_id: string | null }>;
}

export async function getPropertiesReport(db: Db, p: ReportParams): Promise<PropertiesReport> {
  const o = p.ownerId;
  const pv = toCurrencySql("pr", "price", p.currency, p.usdRate);
  const r = [p.period.fromIso, p.period.toIso];
  const [byStatus, byDistrict, byType, inv, dom, priceChanges, noPhotos, inquired, visited, stale] = await Promise.all([
    db.query<{ key: string; count: number }>("select pr.status as key, count(*)::int as count from public.properties pr where ($1::uuid is null or pr.advisor_id = $1) group by 1 order by count desc", [o]),
    db.query<{ key: string; count: number; avg_price: number }>(
      `select pr.district as key, count(*)::int as count, coalesce(avg(${pv}), 0) as avg_price from public.properties pr
        where pr.status in ('available', 'reserved') and ($1::uuid is null or pr.advisor_id = $1) group by 1 order by count desc limit 10`,
      [o],
    ),
    db.query<{ key: string; count: number }>("select pr.property_type as key, count(*)::int as count from public.properties pr where pr.status in ('available', 'reserved') and ($1::uuid is null or pr.advisor_id = $1) group by 1 order by count desc", [o]),
    db.scalar<number>(`select coalesce(sum(${pv}), 0) from public.properties pr where pr.status in ('available', 'reserved') and pr.operation = 'sale' and ($1::uuid is null or pr.advisor_id = $1)`, [o]),
    db.one<{ avg_days: number | null; n: number }>(
      `select avg(extract(epoch from (op.won_at - pr.created_at)) / 86400.0) as avg_days, count(*)::int as n
         from public.opportunities op join public.properties pr on pr.id = op.property_id
        where op.stage = 'won' and op.won_at >= $1 and op.won_at < $2 and ($3::uuid is null or pr.advisor_id = $3)`,
      [...r, o],
    ),
    db.scalar<number>("select count(*) from public.property_price_history h join public.properties pr on pr.id = h.property_id where h.changed_at >= $1 and h.changed_at < $2 and ($3::uuid is null or pr.advisor_id = $3)", [...r, o]),
    db.scalar<number>("select count(*) from public.properties pr where pr.status in ('available', 'reserved') and not exists (select 1 from public.property_images i where i.property_id = pr.id) and ($1::uuid is null or pr.advisor_id = $1)", [o]),
    db.query<{ id: string; code: string; title: string; count: number }>(
      `select pr.id, pr.code, pr.title, count(*)::int as count from public.leads l join public.properties pr on pr.id = l.property_id
        where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or pr.advisor_id = $3) group by 1, 2, 3 order by count desc, pr.code limit 8`,
      [...r, o],
    ),
    db.query<{ id: string; code: string; title: string; count: number }>(
      `select pr.id, pr.code, pr.title, count(*)::int as count from public.visits v join public.properties pr on pr.id = v.property_id
        where v.status = 'completed' and v.scheduled_at >= $1 and v.scheduled_at < $2 and ($3::uuid is null or pr.advisor_id = $3) group by 1, 2, 3 order by count desc, pr.code limit 8`,
      [...r, o],
    ),
    db.query<PropertiesReport["stale"][number]>(
      `select pr.id, pr.code, pr.title, pr.district, pr.price, pr.currency, pr.advisor_id,
              floor(extract(epoch from (now() - coalesce(pr.published_at, pr.created_at))) / 86400)::int as days
         from public.properties pr
        where pr.status = 'available' and coalesce(pr.published_at, pr.created_at) < now() - interval '45 days'
          and not exists (select 1 from public.leads l where l.property_id = pr.id and l.created_at > now() - interval '30 days')
          and not exists (select 1 from public.visits v where v.property_id = pr.id and v.scheduled_at > now() - interval '30 days')
          and ($1::uuid is null or pr.advisor_id = $1)
        order by days desc limit 10`,
      [o],
    ),
  ]);
  return {
    byStatus,
    byDistrict: byDistrict.map((d) => ({ key: d.key, count: d.count, avgPrice: num(d.avg_price) })),
    byType,
    inventoryValue: num(inv),
    daysOnMarket: dom?.avg_days == null ? null : num(dom.avg_days),
    closedInPeriod: dom?.n ?? 0,
    priceChanges: num(priceChanges),
    withoutPhotos: num(noPhotos),
    topInquired: inquired,
    topVisited: visited,
    stale: stale.map((s) => ({ ...s, price: num(s.price) })),
  };
}

// =============================================================================
// Seguimiento
// =============================================================================
export interface FollowupReport {
  leadAlerts: Record<LeadAlertKey, number>;
  firstResponse: { avgHours: number | null; withinTarget: number; total: number; targetHours: number };
  tasks: Array<{ id: string; name: string; done: number; overdue: number; open: number; rate: number }>;
  visits: { total: number; completed: number; cancelled: number; noShow: number; upcoming: number; outcomes: Array<{ key: string; count: number }> };
  stalledOpps: number;
}

export async function getFollowupReport(db: Db, p: ReportParams): Promise<FollowupReport> {
  const o = p.ownerId;
  const t = await loadThresholds(db);
  const r = [p.period.fromIso, p.period.toIso];
  const [alerts, fr, tasks, visits, outcomes, stalled] = await Promise.all([
    leadAlertCounts(db),
    db.one<{ avg_h: number | null; within: number; total: number }>(
      `select avg(extract(epoch from (l.first_contacted_at - l.created_at)) / 3600.0) as avg_h,
              count(*) filter (where l.first_contacted_at is not null and l.first_contacted_at - l.created_at <= make_interval(hours => $4))::int as within,
              count(*)::int as total
         from public.leads l where l.created_at >= $1 and l.created_at < $2 and ($3::uuid is null or l.assigned_to = $3)`,
      [...r, o, Math.max(1, Math.trunc(t.firstResponseH))],
    ),
    db.query<{ id: string; name: string; done: number; overdue: number; open: number }>(
      `select u.id, u.full_name as name,
              count(k.id) filter (where k.status = 'completed' and k.completed_at >= $1 and k.completed_at < $2)::int as done,
              count(k.id) filter (where k.status in ('pending', 'in_progress') and k.due_at < now())::int as overdue,
              count(k.id) filter (where k.status in ('pending', 'in_progress') and k.due_at >= now())::int as open
         from public.users u left join public.tasks k on k.assigned_to = u.id
        where u.status = 'active' and u.role in ('advisor', 'manager') and ($3::uuid is null or u.id = $3)
        group by u.id, u.full_name order by overdue desc, name`,
      [...r, o],
    ),
    db.one<{ total: number; completed: number; cancelled: number; no_show: number; upcoming: number }>(
      `select count(*) filter (where v.scheduled_at >= $1 and v.scheduled_at < $2 and v.status <> 'rescheduled')::int as total,
              count(*) filter (where v.scheduled_at >= $1 and v.scheduled_at < $2 and v.status = 'completed')::int as completed,
              count(*) filter (where v.scheduled_at >= $1 and v.scheduled_at < $2 and v.status = 'cancelled')::int as cancelled,
              count(*) filter (where v.scheduled_at >= $1 and v.scheduled_at < $2 and v.status = 'no_show')::int as no_show,
              count(*) filter (where v.status in ('scheduled', 'confirmed') and v.scheduled_at >= now())::int as upcoming
         from public.visits v where ($3::uuid is null or v.advisor_id = $3)`,
      [...r, o],
    ),
    db.query<{ key: string; count: number }>(
      "select v.outcome as key, count(*)::int as count from public.visits v where v.status = 'completed' and v.scheduled_at >= $1 and v.scheduled_at < $2 and ($3::uuid is null or v.advisor_id = $3) group by 1 order by count desc",
      [...r, o],
    ),
    db.scalar<number>(
      `select count(*) from public.opportunities op join public.pipeline_stages s on s.key = op.stage and s.kind = 'open'
        where coalesce(op.last_activity_at, op.created_at) < now() - make_interval(days => $2) and ($1::uuid is null or op.assigned_to = $1)`,
      [o, Math.max(1, Math.trunc(t.oppDays))],
    ),
  ]);
  return {
    leadAlerts: alerts,
    firstResponse: { avgHours: fr?.avg_h == null ? null : num(fr.avg_h), withinTarget: fr?.within ?? 0, total: fr?.total ?? 0, targetHours: t.firstResponseH },
    tasks: tasks.map((x) => ({ ...x, rate: x.done + x.overdue ? (x.done / (x.done + x.overdue)) * 100 : 100 })),
    visits: { total: visits?.total ?? 0, completed: visits?.completed ?? 0, cancelled: visits?.cancelled ?? 0, noShow: visits?.no_show ?? 0, upcoming: visits?.upcoming ?? 0, outcomes },
    stalledOpps: num(stalled),
  };
}
