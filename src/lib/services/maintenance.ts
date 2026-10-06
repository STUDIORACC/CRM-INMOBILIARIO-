import type { Db } from "@/lib/db/types";

/**
 * Recalcula campos derivados en bloque (los triggers los mantienen en operación
 * normal; esto se usa tras cargas masivas como el seed o importaciones grandes).
 */
export async function refreshDerivedFields(db: Db): Promise<void> {
  const touch = (table: string, col: string, ownerKey: string) => `
    update public.${table} t set last_activity_at = x.last_at ${table === "leads" ? ", first_contacted_at = x.first_at" : ""}
      from (
        select ${ownerKey} as id,
               max(occurred_at) filter (where type <> 'system') as last_at,
               min(occurred_at) filter (where type in ('call', 'whatsapp', 'email') and direction = 'outbound') as first_at
          from public.activities where ${col} is not null group by ${ownerKey}
      ) x
     where t.id = x.id`;

  await db.query(touch("leads", "lead_id", "lead_id"));
  await db.query(touch("clients", "client_id", "client_id"));
  await db.query(touch("opportunities", "opportunity_id", "opportunity_id"));

  await db.query(`
    update public.leads set next_follow_up_at = null, next_follow_up_title = null
     where next_follow_up_at is not null
       and not exists (select 1 from public.tasks t where t.lead_id = leads.id and t.status in ('pending', 'in_progress'))`);
  await db.query(`
    update public.leads l set next_follow_up_at = t.due_at, next_follow_up_title = t.title
      from (select distinct on (lead_id) lead_id, due_at, title
              from public.tasks
             where lead_id is not null and status in ('pending', 'in_progress')
             order by lead_id, due_at) t
     where l.id = t.lead_id`);

  await db.query(`
    update public.opportunities o set next_activity_at = n.at, next_activity_title = n.title
      from (
        select distinct on (opportunity_id) opportunity_id, at, title
          from (
            select opportunity_id, due_at as at, title
              from public.tasks
             where opportunity_id is not null and status in ('pending', 'in_progress')
            union all
            select v.opportunity_id, v.scheduled_at, 'Visita · ' || p.code
              from public.visits v join public.properties p on p.id = v.property_id
             where v.opportunity_id is not null and v.status in ('scheduled', 'confirmed')
          ) u
         order by opportunity_id, at
      ) n
     where o.id = n.opportunity_id`);
}
