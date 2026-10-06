import { Filters, likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { APP_TZ, fmtDateTime, fromInputDateTime } from "@/lib/domain/dates";
import type { SessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { nn } from "@/lib/validation/common";
import type { TaskInput, TaskListQuery } from "@/lib/validation/tasks";
import { logSystemEvent } from "./events";
import { orScope } from "./sql-helpers";

export interface TaskListRow {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  priority: string;
  due_at: string;
  status: string;
  completed_at: string | null;
  assigned_to: string;
  lead_id: string | null;
  client_id: string | null;
  opportunity_id: string | null;
  property_id: string | null;
  lead_name: string | null;
  client_name: string | null;
  property_code: string | null;
  overdue: boolean;
}

const EOD = `(date_trunc('day', now() at time zone '${APP_TZ}') + interval '1 day') at time zone '${APP_TZ}'`;

export interface TaskCounts {
  today: number;
  upcoming: number;
  overdue: number;
  completed: number;
}

export async function listTasks(db: Db, session: SessionUser, q: TaskListQuery): Promise<{ rows: TaskListRow[]; total: number; counts: TaskCounts; userId: string | "all" }> {
  const userId = q.user === "all" ? "all" : (q.user ?? session.id);

  const base = new Filters();
  if (userId !== "all") base.add("k.assigned_to = ?::uuid", userId);

  // Conteos por pestaña (respetan el responsable elegido)
  const counts = await db.one<{ today: number; upcoming: number; overdue: number; completed: number }>(
    `select count(*) filter (where k.status in ('pending', 'in_progress') and k.due_at < ${EOD})::int as today,
            count(*) filter (where k.status in ('pending', 'in_progress') and k.due_at >= ${EOD})::int as upcoming,
            count(*) filter (where k.status in ('pending', 'in_progress') and k.due_at < now())::int as overdue,
            count(*) filter (where k.status = 'completed' and k.completed_at > now() - interval '30 days')::int as completed
       from public.tasks k ${base.where}`,
    base.params,
  );

  const f = new Filters();
  if (userId !== "all") f.add("k.assigned_to = ?::uuid", userId);
  switch (q.tab) {
    case "today":
      f.raw(`k.status in ('pending', 'in_progress') and k.due_at < ${EOD}`);
      break;
    case "upcoming":
      f.raw(`k.status in ('pending', 'in_progress') and k.due_at >= ${EOD}`);
      break;
    case "overdue":
      f.raw("k.status in ('pending', 'in_progress') and k.due_at < now()");
      break;
    case "completed":
      f.raw("k.status = 'completed'");
      break;
    default:
      f.raw("k.status <> 'cancelled'");
  }
  if (q.q) f.add("(k.title ilike ? or l.full_name ilike ? or c.full_name ilike ?)", likePattern(q.q), likePattern(q.q), likePattern(q.q));
  if (q.priority) f.add("k.priority = ?", q.priority);
  if (q.kind) f.add("k.kind = ?", q.kind);

  const order = q.tab === "completed" ? "k.completed_at desc nulls last" : "k.due_at asc";
  const limit = f.param(q.pageSize);
  const offset = f.param((q.page - 1) * q.pageSize);

  const join = `from public.tasks k
      left join public.leads l on l.id = k.lead_id
      left join public.clients c on c.id = k.client_id
      left join public.properties p on p.id = k.property_id`;
  const [rows, total] = await Promise.all([
    db.query<TaskListRow>(
      `select k.id, k.title, k.description, k.kind, k.priority, k.due_at, k.status, k.completed_at, k.assigned_to, k.lead_id, k.client_id, k.opportunity_id, k.property_id,
              l.full_name as lead_name, c.full_name as client_name, p.code as property_code,
              (k.status in ('pending', 'in_progress') and k.due_at < now()) as overdue
         ${join} ${f.where} order by ${order} limit ${limit} offset ${offset}`,
      f.params,
    ),
    db.scalar<number>(`select count(*) ${join} ${f.where}`, f.params.slice(0, f.params.length - 2)),
  ]);

  return { rows, total: Number(total ?? 0), counts: counts ?? { today: 0, upcoming: 0, overdue: 0, completed: 0 }, userId };
}

async function logTaskLinks(db: Db, session: SessionUser, args: { title: string; type: "task"; body: string; leadId: string | null; clientId: string | null; opportunityId: string | null; propertyId: string | null }) {
  if (!args.leadId && !args.clientId && !args.opportunityId) return;
  await db.query(
    `insert into public.activities (type, title, body, lead_id, client_id, opportunity_id, property_id, user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [args.type, args.title, args.body, args.leadId, args.clientId, args.opportunityId, args.propertyId, session.id],
  );
}

export async function createTask(db: Db, session: SessionUser, input: TaskInput): Promise<{ id: string }> {
  const due = fromInputDateTime(input.dueAt);
  if (!due) throw new AppError("La fecha límite no es válida.", { dueAt: ["Fecha inválida"] });
  const leadId = nn(input.leadId);
  const clientId = nn(input.clientId);
  const opportunityId = nn(input.opportunityId);
  const propertyId = nn(input.propertyId);
  const row = await db.one<{ id: string }>(
    `insert into public.tasks (title, description, kind, assigned_to, priority, due_at, lead_id, client_id, opportunity_id, property_id, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [input.title, nn(input.description), input.kind, input.assignedTo, input.priority, due, leadId, clientId, opportunityId, propertyId, session.id],
  );
  await logTaskLinks(db, session, {
    type: "task",
    title: `Seguimiento programado: ${input.title}`,
    body: `Para el ${fmtDateTime(due)}`,
    leadId,
    clientId,
    opportunityId,
    propertyId,
  });
  return { id: row!.id };
}

export async function updateTask(db: Db, input: TaskInput & { id: string }): Promise<void> {
  const due = fromInputDateTime(input.dueAt);
  if (!due) throw new AppError("La fecha límite no es válida.", { dueAt: ["Fecha inválida"] });
  const res = await db.query(
    `update public.tasks set title = $2, description = $3, kind = $4, assigned_to = $5, priority = $6, due_at = $7,
            lead_id = $8, client_id = $9, opportunity_id = $10, property_id = $11
      where id = $1 returning id`,
    [input.id, input.title, nn(input.description), input.kind, input.assignedTo, input.priority, due, nn(input.leadId), nn(input.clientId), nn(input.opportunityId), nn(input.propertyId)],
  );
  if (res.length === 0) throw new AppError("No se encontró la tarea o no tienes permiso para editarla.");
}

export async function setTaskStatus(db: Db, session: SessionUser, id: string, status: "pending" | "in_progress" | "completed" | "cancelled"): Promise<void> {
  const row = await db.one<{ title: string; lead_id: string | null; client_id: string | null; opportunity_id: string | null; property_id: string | null }>(
    "update public.tasks set status = $2 where id = $1 returning title, lead_id, client_id, opportunity_id, property_id",
    [id, status],
  );
  if (!row) throw new AppError("No se encontró la tarea o no tienes permiso para modificarla.");
  if (status === "completed" && (row.lead_id || row.client_id || row.opportunity_id)) {
    await logSystemEvent(db, {
      event: "task_completed",
      userId: session.id,
      leadId: row.lead_id,
      clientId: row.client_id,
      opportunityId: row.opportunity_id,
      propertyId: row.property_id,
      meta: { name: row.title },
    });
  }
}

export async function rescheduleTask(db: Db, id: string, dueIso: string): Promise<void> {
  const res = await db.query("update public.tasks set due_at = $2, status = case when status = 'completed' then status else 'pending' end where id = $1 returning id", [id, dueIso]);
  if (res.length === 0) throw new AppError("No se encontró la tarea.");
}

export async function deleteTask(db: Db, id: string): Promise<void> {
  const res = await db.query("delete from public.tasks where id = $1 returning id", [id]);
  if (res.length === 0) throw new AppError("No se pudo eliminar la tarea (sin permiso o ya no existe).");
}

/** Tareas vinculadas a un registro (lead, cliente, oportunidad o propiedad). */
export async function tasksForRecord(db: Db, scope: { leadId?: string | null; clientId?: string | null; opportunityId?: string | null; propertyId?: string | null; leadIds?: string[] }): Promise<TaskListRow[]> {
  const sc = orScope();
  sc.eq("k.lead_id", scope.leadId);
  sc.any("k.lead_id", scope.leadIds);
  sc.eq("k.client_id", scope.clientId);
  sc.eq("k.opportunity_id", scope.opportunityId);
  sc.eq("k.property_id", scope.propertyId);
  const { params, conds } = sc;
  if (!conds.length) return [];
  return db.query<TaskListRow>(
    `select k.id, k.title, k.description, k.kind, k.priority, k.due_at, k.status, k.completed_at, k.assigned_to, k.lead_id, k.client_id, k.opportunity_id, k.property_id,
            l.full_name as lead_name, c.full_name as client_name, p.code as property_code,
            (k.status in ('pending', 'in_progress') and k.due_at < now()) as overdue
       from public.tasks k
       left join public.leads l on l.id = k.lead_id left join public.clients c on c.id = k.client_id left join public.properties p on p.id = k.property_id
      where (${conds.join(" or ")}) and k.status <> 'cancelled'
      order by (k.status in ('pending', 'in_progress')) desc, case when k.status in ('pending', 'in_progress') then k.due_at end asc, k.completed_at desc nulls last
      limit 60`,
    params,
  );
}
