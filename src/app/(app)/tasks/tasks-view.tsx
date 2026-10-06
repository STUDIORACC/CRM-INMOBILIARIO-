"use client";

import Link from "next/link";
import { useMemo } from "react";
import { differenceInCalendarDays } from "date-fns";
import { CheckCircle2, CheckSquare, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { deleteTaskAction, postponeTaskAction, setTaskStatusAction } from "@/actions/tasks";
import { useQuickActions } from "@/components/quick/quick-actions";
import { PriorityBadge } from "@/components/shared/badges";
import { Pagination } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { TaskCheck } from "@/components/shared/task-check";
import { UserChip } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlParams } from "@/hooks/use-url-params";
import { TASK_KINDS, labelOf } from "@/lib/domain/constants";
import { dayLabel, fmtDate, fmtRelative, fmtTime, toInputDateTime, tz } from "@/lib/domain/dates";
import type { TaskCounts, TaskListRow } from "@/lib/services/tasks";
import { cn } from "@/lib/utils";

type Tab = "today" | "upcoming" | "overdue" | "completed" | "all";

const TABS: Array<{ value: Tab; label: string; count?: keyof TaskCounts; tone?: string }> = [
  { value: "today", label: "Hoy", count: "today" },
  { value: "overdue", label: "Vencidas", count: "overdue", tone: "text-rose-600" },
  { value: "upcoming", label: "Próximas", count: "upcoming" },
  { value: "completed", label: "Completadas", count: "completed" },
  { value: "all", label: "Todas" },
];

const EMPTY: Record<Tab, { title: string; description: string }> = {
  today: { title: "Nada pendiente para hoy", description: "Buen trabajo. Revisa las próximas tareas o programa seguimientos para tus leads." },
  overdue: { title: "No tienes tareas vencidas", description: "Estás al día con tus seguimientos." },
  upcoming: { title: "No hay tareas próximas", description: "Programa el siguiente seguimiento desde un lead, cliente u oportunidad." },
  completed: { title: "Aún no hay tareas completadas", description: "Las tareas que completes en los últimos 30 días aparecerán aquí." },
  all: { title: "No hay tareas con estos filtros", description: "Cambia los filtros o crea una nueva tarea." },
};

interface Group {
  key: string;
  label: string;
  tone?: string;
  rows: TaskListRow[];
}

function groupRows(rows: TaskListRow[], tab: Tab): Group[] {
  if (tab === "completed") return rows.length ? [{ key: "done", label: "Completadas recientemente", rows }] : [];
  const now = new Date();
  const order = ["overdue", "today", "tomorrow", "week", "later"];
  const meta: Record<string, { label: string; tone?: string }> = {
    overdue: { label: "Vencidas", tone: "text-rose-600" },
    today: { label: "Hoy" },
    tomorrow: { label: "Mañana" },
    week: { label: "Esta semana" },
    later: { label: "Más adelante" },
  };
  const buckets = new Map<string, TaskListRow[]>();
  for (const t of rows) {
    const diff = differenceInCalendarDays(tz(t.due_at), tz(now));
    const key = t.status === "completed" ? "later" : t.overdue ? "overdue" : diff <= 0 ? "today" : diff === 1 ? "tomorrow" : diff <= 7 ? "week" : "later";
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(t);
  }
  return order.filter((k) => buckets.has(k)).map((k) => ({ key: k, ...meta[k], rows: buckets.get(k)! }));
}

export function TasksView({
  rows,
  total,
  counts,
  tab,
  userId,
  page,
  pageSize,
  sessionId,
  team,
  filterBar,
}: {
  rows: TaskListRow[];
  total: number;
  counts: TaskCounts;
  tab: Tab;
  userId: string;
  page: number;
  pageSize: number;
  sessionId: string;
  team: Array<{ id: string; name: string }> | null;
  filterBar: React.ReactNode;
}) {
  const { update, pending } = useUrlParams();
  const groups = useMemo(() => groupRows(rows, tab), [rows, tab]);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={cn("space-y-4", pending && "opacity-70 transition-opacity")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1" role="tablist" aria-label="Estado de las tareas">
          {TABS.map((t) => {
            const on = tab === t.value;
            const n = t.count ? counts[t.count] : null;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => update({ tab: t.value === "today" ? null : t.value })}
                className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}
              >
                {t.label}
                {n != null && <span className={cn("rounded-full px-1.5 text-[11px] tabular", on ? "bg-white/25" : n > 0 && t.tone ? "bg-rose-50 " + t.tone : "bg-muted")}>{n}</span>}
              </button>
            );
          })}
        </div>
        {team && (
          <Select value={userId} onValueChange={(v) => update({ user: v === "all" ? null : v })}>
            <SelectTrigger className="w-52" aria-label="Responsable">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el equipo</SelectItem>
              <SelectItem value={sessionId}>Mis tareas</SelectItem>
              {team
                .filter((u) => u.id !== sessionId)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="rounded-xl border bg-card p-3 shadow-card">{filterBar}</div>

      {groups.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-card">
          <EmptyState icon={tab === "completed" ? <CheckCircle2 className="size-5" /> : <CheckSquare className="size-5" />} title={EMPTY[tab].title} description={EMPTY[tab].description} />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className={cn("mb-2 flex items-center gap-2 text-sm font-semibold", g.tone)}>
                {g.label}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{g.rows.length}</span>
              </h2>
              <ul className="divide-y rounded-xl border bg-card shadow-card">
                {g.rows.map((t) => (
                  <TaskRow key={t.id} t={t} showOwner={userId !== sessionId} />
                ))}
              </ul>
            </section>
          ))}
          {total > pageSize && (
            <Pagination page={page} lastPage={lastPage} total={total} from={(page - 1) * pageSize + 1} to={Math.min(total, page * pageSize)} pageSize={pageSize} onPage={(n) => update({ page: String(n) }, { resetPage: false })} onPageSize={(s) => update({ pageSize: String(s) })} />
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ t, showOwner }: { t: TaskListRow; showOwner: boolean }) {
  const { open } = useQuickActions();
  const done = t.status === "completed";
  const party = t.lead_name ?? t.client_name;
  const href = t.lead_id ? `/leads/${t.lead_id}` : t.client_id ? `/clients/${t.client_id}` : t.opportunity_id ? `/opportunities/${t.opportunity_id}` : t.property_id ? `/properties/${t.property_id}` : null;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <TaskCheck id={t.id} done={done} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{t.title}</div>
        {t.description && !done && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <span className={cn("font-medium", t.overdue ? "text-rose-600" : "text-foreground/80")}>
            {done && t.completed_at ? `Completada ${fmtRelative(t.completed_at)}` : `${dayLabel(t.due_at)} · ${fmtTime(t.due_at)}`}
            {t.overdue && !done && ` · venció ${fmtRelative(t.due_at)}`}
          </span>
          <span>{labelOf(TASK_KINDS, t.kind)}</span>
          {party && href && (
            <Link href={href} className="font-medium text-primary hover:underline">
              {party}
              {t.property_code ? ` · ${t.property_code}` : ""}
            </Link>
          )}
          {!party && href && t.property_code && (
            <Link href={href} className="font-medium text-primary hover:underline">
              {t.property_code}
            </Link>
          )}
          {!done && <PriorityBadge value={t.priority} />}
          {showOwner && <UserChip userId={t.assigned_to} size="xs" className="max-w-[9rem]" />}
          {!t.overdue && !done && <span className="hidden text-[11px] sm:inline">{fmtDate(t.due_at)}</span>}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Acciones de la tarea">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!done && (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  open("task", {
                    leadId: t.lead_id ?? undefined,
                    clientId: t.client_id ?? undefined,
                    opportunityId: t.opportunity_id ?? undefined,
                    propertyId: t.property_id ?? undefined,
                    task: { id: t.id, title: t.title, description: t.description ?? "", kind: t.kind as never, assignedTo: t.assigned_to, priority: t.priority as never, dueAt: toInputDateTime(t.due_at) },
                  })
                }
              >
                Editar
              </DropdownMenuItem>
              {[1, 3, 7].map((d) => (
                <DropdownMenuItem
                  key={d}
                  onSelect={async () => {
                    const res = await postponeTaskAction({ id: t.id, days: d });
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.error);
                  }}
                >
                  Posponer {d === 7 ? "1 semana" : d === 1 ? "1 día" : `${d} días`}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onSelect={async () => {
                  const res = await setTaskStatusAction({ id: t.id, status: "cancelled" });
                  if (res.ok) toast.success("Tarea cancelada");
                  else toast.error(res.error);
                }}
              >
                Cancelar tarea
              </DropdownMenuItem>
            </>
          )}
          {done && (
            <DropdownMenuItem
              onSelect={async () => {
                const res = await setTaskStatusAction({ id: t.id, status: "pending" });
                if (res.ok) toast.success("Tarea reabierta");
                else toast.error(res.error);
              }}
            >
              Reabrir tarea
            </DropdownMenuItem>
          )}
          <>
            <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  const res = await deleteTaskAction({ id: t.id });
                  if (res.ok) toast.success(res.message);
                  else toast.error(res.error);
                }}
              >
                Eliminar
              </DropdownMenuItem>
          </>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
