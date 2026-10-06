import type { Db } from "@/lib/db/types";
import type { Currency, Role } from "@/lib/domain/constants";
import type { ResolvedPeriod } from "@/lib/domain/dates";
import { toCurrencySql } from "./sql-helpers";

export interface AdvisorStats {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: Role;
  status: "active" | "inactive";
  hired_at: string;
  new_leads: number;
  active_leads: number;
  hot_leads: number;
  contacted: number;
  avg_response_hours: number | null;
  visits_done: number;
  visits_upcoming: number;
  open_opps: number;
  open_value: number;
  weighted_value: number;
  won_count: number;
  won_value: number;
  lost_count: number;
  tasks_done: number;
  tasks_overdue: number;
  activities: number;
  properties_listed: number;
  /** Cierres del periodo ÷ leads nuevos del periodo (máx. 100). */
  conversion: number;
  /** % de leads nuevos contactados. */
  contact_rate: number;
}

/** Rendimiento por usuario del equipo comercial en el periodo, calculado desde la base de datos. */
export async function getTeamStats(db: Db, period: ResolvedPeriod, currency: Currency, usdRate: number, onlyUserId?: string): Promise<AdvisorStats[]> {
  const v = toCurrencySql("o", "value", currency, usdRate);
  const rows = await db.query<Omit<AdvisorStats, "conversion" | "contact_rate">>(
    `select u.id, u.full_name, u.email, u.phone, u.avatar_url, u.role, u.status, u.hired_at,
            coalesce(l.new_leads, 0)::int as new_leads,
            coalesce(l.active_leads, 0)::int as active_leads,
            coalesce(l.hot_leads, 0)::int as hot_leads,
            coalesce(l.contacted, 0)::int as contacted,
            l.avg_response_hours,
            coalesce(vi.done, 0)::int as visits_done,
            coalesce(vi.upcoming, 0)::int as visits_upcoming,
            coalesce(op.open_count, 0)::int as open_opps,
            coalesce(op.open_value, 0) as open_value,
            coalesce(op.weighted_value, 0) as weighted_value,
            coalesce(op.won_count, 0)::int as won_count,
            coalesce(op.won_value, 0) as won_value,
            coalesce(op.lost_count, 0)::int as lost_count,
            coalesce(tk.done, 0)::int as tasks_done,
            coalesce(tk.overdue, 0)::int as tasks_overdue,
            coalesce(ac.total, 0)::int as activities,
            coalesce(pr.listed, 0)::int as properties_listed
       from public.users u
       left join (
         select assigned_to,
                count(*) filter (where created_at >= $1 and created_at < $2) as new_leads,
                count(*) filter (where stage not in ('won', 'lost')) as active_leads,
                count(*) filter (where stage not in ('won', 'lost') and temperature in ('hot', 'very_hot')) as hot_leads,
                count(*) filter (where created_at >= $1 and created_at < $2 and first_contacted_at is not null) as contacted,
                avg(extract(epoch from (first_contacted_at - created_at)) / 3600.0)
                  filter (where created_at >= $1 and created_at < $2 and first_contacted_at is not null) as avg_response_hours
           from public.leads group by assigned_to) l on l.assigned_to = u.id
       left join (
         select advisor_id,
                count(*) filter (where status = 'completed' and scheduled_at >= $1 and scheduled_at < $2) as done,
                count(*) filter (where status in ('scheduled', 'confirmed') and scheduled_at >= now()) as upcoming
           from public.visits group by advisor_id) vi on vi.advisor_id = u.id
       left join (
         select o.assigned_to,
                count(*) filter (where s.kind = 'open') as open_count,
                sum(${v}) filter (where s.kind = 'open') as open_value,
                sum(${v} * o.probability / 100.0) filter (where s.kind = 'open') as weighted_value,
                count(*) filter (where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2) as won_count,
                sum(${v}) filter (where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2) as won_value,
                count(*) filter (where o.stage = 'lost' and o.lost_at >= $1 and o.lost_at < $2) as lost_count
           from public.opportunities o join public.pipeline_stages s on s.key = o.stage group by o.assigned_to) op on op.assigned_to = u.id
       left join (
         select assigned_to,
                count(*) filter (where status = 'completed' and completed_at >= $1 and completed_at < $2) as done,
                count(*) filter (where status in ('pending', 'in_progress') and due_at < now()) as overdue
           from public.tasks group by assigned_to) tk on tk.assigned_to = u.id
       left join (
         select user_id, count(*) as total from public.activities
          where type not in ('system', 'note') and occurred_at >= $1 and occurred_at < $2 group by user_id) ac on ac.user_id = u.id
       left join (
         select advisor_id, count(*) as listed from public.properties where status in ('available', 'reserved') group by advisor_id) pr on pr.advisor_id = u.id
      where u.role in ('advisor', 'manager', 'admin') and ($3::uuid is null or u.id = $3::uuid)
      order by u.status, u.full_name`,
    [period.fromIso, period.toIso, onlyUserId ?? null],
  );
  return rows.map((r) => {
    const newLeads = Number(r.new_leads);
    return {
      ...r,
      open_value: Number(r.open_value),
      weighted_value: Number(r.weighted_value),
      won_value: Number(r.won_value),
      avg_response_hours: r.avg_response_hours == null ? null : Number(r.avg_response_hours),
      conversion: newLeads ? Math.min(100, (r.won_count / newLeads) * 100) : 0,
      contact_rate: newLeads ? Math.min(100, (r.contacted / newLeads) * 100) : 0,
    };
  });
}
