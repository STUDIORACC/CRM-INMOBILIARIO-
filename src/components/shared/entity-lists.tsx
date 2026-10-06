"use client";

import Link from "next/link";
import { CalendarCheck, CalendarClock, CalendarPlus, CheckSquare, ClipboardList, MapPin, MoreHorizontal, Plus, Target, XCircle } from "lucide-react";
import { toast } from "sonner";
import { confirmVisitAction } from "@/actions/visits";
import { postponeTaskAction, setTaskStatusAction } from "@/actions/tasks";
import { useLookups } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import type { LinkContext } from "@/components/quick/types";
import { ColorChip, PriorityBadge, VisitStatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import { TaskCheck } from "@/components/shared/task-check";
import { UserChip } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TASK_KINDS, VISIT_OUTCOMES, labelOf } from "@/lib/domain/constants";
import { dayLabel, fmtDate, fmtRelative, fmtTime, toInputDateTime } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import type { OpportunityRow } from "@/lib/services/opportunities";
import type { TaskListRow } from "@/lib/services/tasks";
import type { VisitRow } from "@/lib/services/visits";
import { cn } from "@/lib/utils";

/** Acciones disponibles sobre una visita (confirmar, resultado, reprogramar, cancelar). */
export function VisitActions({ visit }: { visit: VisitRow }) {
  const { open } = useQuickActions();
  const active = ["scheduled", "confirmed"].includes(visit.status);
  if (!active) return null;
  const label = `${visit.property_code} · ${visit.property_title}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Acciones de la visita">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {visit.status === "scheduled" && (
          <DropdownMenuItem
            onSelect={async () => {
              const res = await confirmVisitAction({ id: visit.id });
              if (res.ok) toast.success(res.message);
              else toast.error(res.error);
            }}
          >
            <CalendarCheck /> Confirmar asistencia
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => open("visit-result", { visitId: visit.id, propertyLabel: label, partyName: visit.party_name })}>
          <ClipboardList /> Registrar resultado
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("visit", { visitId: visit.id, reschedule: true, leadId: visit.lead_id ?? undefined, clientId: visit.client_id ?? undefined })}>
          <CalendarClock /> Reprogramar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => open("visit-cancel", { visitId: visit.id, propertyLabel: label, partyName: visit.party_name })}>
          <XCircle /> Cancelar / no asistió
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Visitas asociadas a un registro (lead, cliente, oportunidad o propiedad). */
export function VisitsList({ visits, context, showParty = false, title = "Visitas" }: { visits: VisitRow[]; context: LinkContext; showParty?: boolean; title?: string }) {
  const { open } = useQuickActions();
  const lookups = useLookups();
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-muted-foreground" /> {title}
          {visits.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{visits.length}</span>}
        </h3>
        <Button size="sm" variant="outline" onClick={() => open("visit", context)}>
          <CalendarPlus /> Agendar
        </Button>
      </header>
      <div className="px-5 pb-4">
        {visits.length === 0 ? (
          <EmptyState compact icon={<MapPin className="size-5" />} title="Aún no hay visitas" description="Agenda una visita para avanzar la oportunidad." />
        ) : (
          <ul className="divide-y">
            {visits.map((v) => (
              <li key={v.id} className="flex items-start gap-3 py-3">
                <div className="w-14 shrink-0 rounded-lg bg-muted px-2 py-1.5 text-center leading-tight">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">{fmtDate(v.scheduled_at).split(" ").slice(0, 2).join(" ")}</div>
                  <div className="text-xs font-semibold tabular">{fmtTime(v.scheduled_at)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/properties/${v.property_id}`} className="text-sm font-medium hover:text-primary">
                      {v.property_code} · {v.property_title}
                    </Link>
                    <VisitStatusBadge value={v.status} />
                    {v.past_due && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Falta resultado</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {showParty && <>{v.party_name} · </>}Asesor: {lookups.userName(v.advisor_id)} · {v.duration_min} min
                  </div>
                  {v.outcome && <div className="mt-1 text-xs font-medium text-foreground">Resultado: {labelOf(VISIT_OUTCOMES, v.outcome)}</div>}
                  {v.advisor_notes && <p className="mt-0.5 text-xs text-muted-foreground">“{v.advisor_notes}”</p>}
                  {v.cancel_reason && <p className="mt-0.5 text-xs text-muted-foreground">Motivo: {v.cancel_reason}</p>}
                </div>
                <VisitActions visit={v} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Tareas y seguimientos de un registro. */
export function TasksList({ tasks, context, title = "Tareas y seguimientos" }: { tasks: TaskListRow[]; context: LinkContext; title?: string }) {
  const { open } = useQuickActions();
  const openTasks = tasks.filter((t) => ["pending", "in_progress"].includes(t.status));
  const doneTasks = tasks.filter((t) => t.status === "completed").slice(0, 5);
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CheckSquare className="size-4 text-muted-foreground" /> {title}
          {openTasks.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{openTasks.length}</span>}
        </h3>
        <Button size="sm" variant="outline" onClick={() => open("task", context)}>
          <Plus /> Tarea
        </Button>
      </header>
      <div className="px-5 pb-4">
        {tasks.length === 0 ? (
          <EmptyState compact icon={<CheckSquare className="size-5" />} title="Sin tareas" description="Programa el próximo seguimiento para que nada se enfríe." />
        ) : (
          <ul className="divide-y">
            {[...openTasks, ...doneTasks].map((t) => {
              const done = t.status === "completed";
              return (
                <li key={t.id} className="flex items-start gap-3 py-2.5">
                  <TaskCheck id={t.id} done={done} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{t.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className={cn("font-medium", t.overdue && "text-rose-600")}>
                        {dayLabel(t.due_at)} {fmtTime(t.due_at)}
                        {t.overdue && " · Vencida"}
                      </span>
                      <span>· {labelOf(TASK_KINDS, t.kind)}</span>
                      <UserChip userId={t.assigned_to} size="xs" className="max-w-[9rem]" />
                      {!done && <PriorityBadge value={t.priority} />}
                    </div>
                  </div>
                  {!done && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Acciones de la tarea">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            open("task", {
                              ...context,
                              task: { id: t.id, title: t.title, description: t.description ?? "", kind: t.kind as never, assignedTo: t.assigned_to, priority: t.priority as never, dueAt: toInputDateTime(t.due_at) },
                            })
                          }
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={async () => {
                            const res = await postponeTaskAction({ id: t.id, days: 1 });
                            if (res.ok) toast.success(res.message);
                            else toast.error(res.error);
                          }}
                        >
                          Posponer 1 día
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={async () => {
                            const res = await setTaskStatusAction({ id: t.id, status: "cancelled" });
                            if (res.ok) toast.success("Tarea cancelada");
                            else toast.error(res.error);
                          }}
                        >
                          Cancelar tarea
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Oportunidades de un lead, cliente o propiedad. */
export function OpportunitiesList({ opps, context, canCreate = true, showParty = false, title = "Oportunidades" }: { opps: OpportunityRow[]; context: LinkContext; canCreate?: boolean; showParty?: boolean; title?: string }) {
  const { open } = useQuickActions();
  const lookups = useLookups();
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="size-4 text-muted-foreground" /> {title}
          {opps.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{opps.length}</span>}
        </h3>
        {canCreate && (
          <Button size="sm" variant="outline" onClick={() => open("opportunity", context)}>
            <Plus /> Crear
          </Button>
        )}
      </header>
      <div className="px-5 pb-4">
        {opps.length === 0 ? (
          <EmptyState compact icon={<Target className="size-5" />} title="Sin oportunidades" description="Crea una oportunidad para seguir el negocio en el pipeline." />
        ) : (
          <ul className="divide-y">
            {opps.map((o) => {
              const s = lookups.stage(o.stage);
              return (
                <li key={o.id}>
                  <Link href={`/opportunities/${o.id}`} className="flex items-center gap-3 py-3 hover:text-primary">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {showParty ? `${o.party_name} · ` : ""}
                        {o.property_code} · {o.property_title}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {lookups.userName(o.assigned_to)} · {o.probability}% · actualizada <span suppressHydrationWarning>{fmtRelative(o.updated_at)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular">{formatMoney(o.value, o.currency)}</span>
                      <ColorChip color={s?.color ?? "#64748b"}>{s?.label ?? o.stage}</ColorChip>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
