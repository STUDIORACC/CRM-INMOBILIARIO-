import type { Db } from "@/lib/db/types";

export interface TimelineItem {
  id: string;
  type: string;
  event: string | null;
  title: string;
  body: string | null;
  direction: string;
  responded: boolean | null;
  occurred_at: string;
  user_id: string | null;
  actor: string | null;
  lead_id: string | null;
  client_id: string | null;
  opportunity_id: string | null;
  property_id: string | null;
  property_code: string | null;
  owner_id: string | null;
  visit_id: string | null;
  note_id: string | null;
  note_body: string | null;
  note_pinned: boolean | null;
  lead_name: string | null;
  client_name: string | null;
}

export interface TimelineScope {
  leadId?: string | null;
  /** Cliente cuyo historial se incluye (p. ej. el cliente convertido desde el lead). */
  clientId?: string | null;
  leadIds?: string[];
  opportunityId?: string | null;
  propertyId?: string | null;
  propertyIds?: string[];
  ownerId?: string | null;
  userId?: string | null;
  types?: string[];
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const SELECT = `
  select a.id, a.type, a.event, a.title, coalesce(a.body, n.body) as body, a.direction, a.responded, a.occurred_at, a.user_id,
         u.full_name as actor, a.lead_id, a.client_id, a.opportunity_id, a.property_id, p.code as property_code, a.owner_id,
         a.visit_id, a.note_id, n.body as note_body, n.pinned as note_pinned, l.full_name as lead_name, c.full_name as client_name
    from public.activities a
    left join public.users u on u.id = a.user_id
    left join public.notes n on n.id = a.note_id
    left join public.properties p on p.id = a.property_id
    left join public.leads l on l.id = a.lead_id
    left join public.clients c on c.id = a.client_id`;

/** Línea de tiempo (actividades + eventos de sistema) de un registro o del equipo. */
export async function listTimeline(db: Db, s: TimelineScope): Promise<{ items: TimelineItem[]; total: number }> {
  const params: Array<string | number | string[]> = [];
  const where: string[] = [];
  const scope: string[] = [];
  const p = (v: string | number | string[]) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (s.leadId) scope.push(`a.lead_id = ${p(s.leadId)}::uuid`);
  if (s.leadIds?.length) scope.push(`a.lead_id = any(${p(s.leadIds)}::uuid[])`);
  if (s.clientId) scope.push(`a.client_id = ${p(s.clientId)}::uuid`);
  if (s.opportunityId) scope.push(`a.opportunity_id = ${p(s.opportunityId)}::uuid`);
  if (s.propertyId) scope.push(`a.property_id = ${p(s.propertyId)}::uuid`);
  if (s.propertyIds?.length) scope.push(`a.property_id = any(${p(s.propertyIds)}::uuid[])`);
  if (s.ownerId) scope.push(`a.owner_id = ${p(s.ownerId)}::uuid`);
  if (scope.length) where.push(`(${scope.join(" or ")})`);
  if (s.userId) where.push(`a.user_id = ${p(s.userId)}::uuid`);
  if (s.types?.length) where.push(`a.type = any(${p(s.types)}::text[])`);
  if (s.q) {
    const like = `%${s.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const t = p(like);
    where.push(`(a.title ilike ${t} or a.body ilike ${t} or n.body ilike ${t} or l.full_name ilike ${t} or c.full_name ilike ${t})`);
  }
  if (s.from) where.push(`a.occurred_at >= ${p(s.from)}::timestamptz`);
  if (s.to) where.push(`a.occurred_at < ${p(s.to)}::timestamptz`);
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const limit = Math.min(s.limit ?? 100, 200);
  const offset = Math.max(0, s.offset ?? 0);

  const [items, total] = await Promise.all([
    db.query<TimelineItem>(`${SELECT} ${clause} order by a.occurred_at desc, a.created_at desc limit ${limit} offset ${offset}`, params),
    db.scalar<number>(
      `select count(*) from public.activities a left join public.notes n on n.id = a.note_id left join public.leads l on l.id = a.lead_id left join public.clients c on c.id = a.client_id ${clause}`,
      params,
    ),
  ]);
  return { items, total: Number(total ?? 0) };
}
