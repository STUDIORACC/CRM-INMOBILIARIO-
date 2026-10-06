import type { Db } from "@/lib/db/types";
import type { VisitOutcome } from "@/lib/domain/constants";
import { scoreLead, type ScoreInput, type ScoreResult } from "@/lib/domain/scoring";

interface ScoreRow {
  id: string;
  stage: string;
  budget_min: number | null;
  budget_max: number | null;
  financing: ScoreInput["financing"];
  interest_level: ScoreInput["interestLevel"];
  purchase_date: string | null;
  has_property: boolean;
  specific_search: boolean;
  responded: boolean | null;
  last_responded_at: string | null;
  last_activity_at: string | null;
  has_scheduled: boolean | null;
  has_done: boolean | null;
  best_outcome: VisitOutcome | null;
  created_at: string;
}

const toInput = (r: ScoreRow): ScoreInput => ({
  stage: r.stage,
  budgetMin: r.budget_min,
  budgetMax: r.budget_max,
  financing: r.financing,
  interestLevel: r.interest_level,
  purchaseDate: r.purchase_date,
  hasPropertyInterest: r.has_property,
  hasSpecificSearch: r.specific_search,
  responded: Boolean(r.responded),
  lastRespondedAt: r.last_responded_at,
  lastActivityAt: r.last_activity_at,
  hasScheduledVisit: Boolean(r.has_scheduled),
  hasCompletedVisit: Boolean(r.has_done),
  bestVisitOutcome: r.best_outcome,
  createdAt: r.created_at,
});

const SELECT = `
  select l.id, l.stage, l.budget_min, l.budget_max, l.financing, l.interest_level,
         l.purchase_date::text as purchase_date,
         (l.property_id is not null) as has_property,
         (l.property_type is not null and cardinality(l.districts) > 0) as specific_search,
         act.responded, act.last_responded_at, l.last_activity_at,
         v.has_scheduled, v.has_done, v.best_outcome, l.created_at
    from public.leads l
    left join lateral (
      select bool_or(a.responded) filter (where a.responded is true) as responded,
             max(a.occurred_at) filter (where a.responded is true) as last_responded_at
        from public.activities a where a.lead_id = l.id
    ) act on true
    left join lateral (
      select bool_or(v.status in ('scheduled', 'confirmed')) as has_scheduled,
             bool_or(v.status = 'completed') as has_done,
             (array_agg(v.outcome order by case v.outcome
                when 'very_interested' then 1 when 'interested' then 2 when 'needs_time' then 3
                when 'wants_other' then 4 else 5 end) filter (where v.status = 'completed'))[1] as best_outcome
        from public.visits v where v.lead_id = l.id
    ) v on true
`;

/** Detalle del puntaje de un lead (factores que suman/restan), para la ficha. */
export async function explainLeadScore(db: Db, leadId: string, now = new Date()): Promise<ScoreResult | null> {
  const row = await db.one<ScoreRow>(`${SELECT} where l.id = $1`, [leadId]);
  return row ? scoreLead(toInput(row), now) : null;
}

/** Recalcula y persiste el score de uno, varios o todos los leads. */
export async function recomputeLeadScores(db: Db, leadIds?: string[], now = new Date()): Promise<number> {
  const rows = await db.query<ScoreRow>(
    leadIds ? `${SELECT} where l.id = any($1::uuid[])` : SELECT,
    leadIds ? [leadIds] : [],
  );
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const scores = rows.map((r) => scoreLead(toInput(r), now).score);
  await db.query(
    `update public.leads l set score = v.score
       from (select unnest($1::uuid[]) as id, unnest($2::int[]) as score) v
      where l.id = v.id and l.score is distinct from v.score`,
    [ids, scores],
  );
  return rows.length;
}
