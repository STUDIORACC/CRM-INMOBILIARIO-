import { Filters, likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { addDaysIso, startOfDayIso } from "@/lib/domain/dates";
import type { AuditQuery } from "@/lib/validation/activities";

export interface AuditRow {
  id: string;
  user_id: string | null;
  actor: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  action: "create" | "update" | "delete";
  event: string;
  changes: Record<string, { from: unknown; to: unknown }> | { snapshot: Record<string, unknown> } | null;
  created_at: string;
}

/** Bitácora de cambios (quién, qué, cuándo). La política RLS limita el acceso a administración y gerencia. */
export async function listAudit(db: Db, q: AuditQuery): Promise<{ rows: AuditRow[]; total: number }> {
  const f = new Filters();
  if (q.entity) f.add("a.entity_type = ?", q.entity);
  if (q.event) f.add("a.event = ?", q.event);
  if (q.user) f.add("a.user_id = ?::uuid", q.user);
  if (q.q) f.add("(a.entity_label ilike ? or u.full_name ilike ?)", likePattern(q.q), likePattern(q.q));
  const from = q.from ? startOfDayIso(q.from) : null;
  const to = q.to ? startOfDayIso(q.to) : null;
  if (from) f.add("a.created_at >= ?::timestamptz", from);
  if (to) f.add("a.created_at < ?::timestamptz", addDaysIso(to, 1));

  const limit = f.param(q.pageSize);
  const offset = f.param((q.page - 1) * q.pageSize);
  const join = "from public.audit_logs a left join public.users u on u.id = a.user_id";
  const [rows, total] = await Promise.all([
    db.query<AuditRow>(
      `select a.id, a.user_id, u.full_name as actor, a.entity_type, a.entity_id, a.entity_label, a.action, a.event, a.changes, a.created_at
         ${join} ${f.where} order by a.created_at desc, a.id limit ${limit} offset ${offset}`,
      f.params,
    ),
    db.scalar<number>(`select count(*) ${join} ${f.where}`, f.params.slice(0, f.params.length - 2)),
  ]);
  return { rows, total: Number(total ?? 0) };
}
