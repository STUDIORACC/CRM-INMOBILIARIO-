import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { ActivityIcon } from "@/components/shared/activity-icon";
import { TemperatureBadge, VisitStatusBadge } from "@/components/shared/badges";
import { Panel } from "@/components/shared/panel";
import { RelativeTime } from "@/components/shared/relative-time";
import { TaskCheck } from "@/components/shared/task-check";
import { EmptyState } from "@/components/shared/states";
import { TASK_KINDS, labelOf } from "@/lib/domain/constants";
import { dayLabel, fmtTime } from "@/lib/domain/dates";
import { formatMoneyCompact } from "@/lib/domain/money";
import type { AlertItem } from "@/lib/services/alerts";
import type { DashboardData } from "@/lib/services/dashboard";
import type { Lookups } from "@/lib/types/catalogs";
import { cn } from "@/lib/utils";

export function AlertsCard({ alerts }: { alerts: AlertItem[] }) {
  return (
    <Panel title="Requiere tu atención" description="Alertas calculadas con los datos actuales" count={alerts.length} className="h-full">
      {alerts.length === 0 ? (
        <EmptyState compact icon={<CheckCircle2 className="size-5 text-emerald-600" />} title="Todo al día" description="No hay leads, tareas ni oportunidades que requieran acción inmediata." />
      ) : (
        <ul className="-mx-2 divide-y">
          {alerts.slice(0, 7).map((a) => (
            <li key={a.key}>
              <Link href={a.href} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", a.severity === "danger" ? "bg-rose-50 text-rose-600" : a.severity === "warning" ? "bg-amber-50 text-amber-600" : "bg-sky-50 text-sky-600")}>
                  {a.severity === "info" ? <Info className="size-4" /> : <AlertTriangle className="size-4" />}
                </span>
                <span className="flex-1 text-sm leading-snug">{a.message}</span>
                <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function TodayTasksCard({ tasks }: { tasks: DashboardData["todayTasks"] }) {
  return (
    <Panel title="Mis tareas de hoy" description="Pendientes de hoy y vencidas" href="/tasks" count={tasks.length}>
      {tasks.length === 0 ? (
        <EmptyState compact icon={<CheckCircle2 className="size-5 text-emerald-600" />} title="No tienes tareas pendientes para hoy" description="Programa seguimientos desde cada lead u oportunidad." />
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg py-1.5">
              <TaskCheck id={t.id} />
              <span className={cn("w-[4.5rem] shrink-0 text-xs font-semibold tabular", t.overdue ? "text-rose-600" : "text-muted-foreground")}>{t.overdue ? `${dayLabel(t.due_at)} ${fmtTime(t.due_at)}` : fmtTime(t.due_at)}</span>
              <span className="min-w-0 flex-1">
                {t.href ? (
                  <Link href={t.href} className="block truncate text-sm font-medium hover:text-primary">
                    {t.title}
                  </Link>
                ) : (
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                )}
                <span className="text-xs text-muted-foreground">{labelOf(TASK_KINDS, t.kind)}</span>
              </span>
              {t.overdue && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Vencida</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function UpcomingVisitsCard({ visits, showAdvisor }: { visits: DashboardData["upcoming"]; showAdvisor: boolean }) {
  return (
    <Panel title="Próximas visitas" description="Agenda de los siguientes días" href="/visits" count={visits.length}>
      {visits.length === 0 ? (
        <EmptyState compact title="No hay visitas programadas" description="Agenda una visita desde un lead, cliente o propiedad." />
      ) : (
        <ul className="divide-y">
          {visits.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-2.5">
              <div className="w-14 shrink-0 rounded-lg bg-muted px-2 py-1.5 text-center leading-tight">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">{dayLabel(v.scheduled_at)}</div>
                <div className="text-xs font-semibold tabular">{fmtTime(v.scheduled_at)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <Link href={v.party_href} className="block truncate text-sm font-medium hover:text-primary">
                  {v.party}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  {v.property_code} · {v.property_title}
                  {showAdvisor && ` · ${v.advisor}`}
                </div>
              </div>
              <VisitStatusBadge value={v.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function HotLeadsCard({ leads, lookups }: { leads: DashboardData["hotLeads"]; lookups: Lookups }) {
  return (
    <Panel title="Leads calientes" description="Mayor probabilidad de cierre; los que no tienen seguimiento van primero" href="/leads?temp=hot,very_hot" count={leads.length}>
      {leads.length === 0 ? (
        <EmptyState compact title="Sin leads calientes por ahora" />
      ) : (
        <ul className="divide-y">
          {leads.map((l) => (
            <li key={l.id}>
              <Link href={`/leads/${l.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{l.full_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {l.property_code ? `${l.property_code} · ` : ""}
                    {lookups.userName(l.assigned_to)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <TemperatureBadge score={l.score} temperature={l.temperature} />
                  {l.next_follow_up_at ? (
                    <span className="text-[11px] text-muted-foreground">Seguimiento {dayLabel(l.next_follow_up_at).toLowerCase()} {fmtTime(l.next_follow_up_at)}</span>
                  ) : (
                    <span className="text-[11px] font-medium text-rose-600">Sin seguimiento programado</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function StalledOppsCard({ opps, lookups }: { opps: DashboardData["stalledOpportunities"]; lookups: Lookups }) {
  return (
    <Panel title="Oportunidades estancadas" description="Sin actividad en el umbral configurado" href="/opportunities?stalled=1" count={opps.length}>
      {opps.length === 0 ? (
        <EmptyState compact icon={<CheckCircle2 className="size-5 text-emerald-600" />} title="Ninguna oportunidad estancada" />
      ) : (
        <ul className="divide-y">
          {opps.map((o) => (
            <li key={o.id}>
              <Link href={`/opportunities/${o.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{o.party}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {o.property_code} · {lookups.stageLabel(o.stage)} · {lookups.userName(o.assigned_to)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular">{formatMoneyCompact(o.value, "PEN")}</div>
                  <div className="text-[11px] font-medium text-amber-700">{o.days} días sin actividad</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function RecentActivityCard({ events, showActor }: { events: DashboardData["recent"]; showActor: boolean }) {
  return (
    <Panel title="Actividad reciente" description="Últimos eventos comerciales" href="/activities" className="h-full">
      {events.length === 0 ? (
        <EmptyState compact title="Aún no hay actividad" />
      ) : (
        <ul className="space-y-0.5">
          {events.map((e) => {
            const inner = (
              <>
                <ActivityIcon type={e.type} event={e.event} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug">
                    {e.party && <b className="font-semibold">{e.party}</b>}
                    {e.party ? " · " : ""}
                    {e.title}
                    {e.property_code && !e.title.includes(e.property_code) ? ` (${e.property_code})` : ""}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {showActor && e.actor ? `${e.actor} · ` : ""}
                    <RelativeTime value={e.occurred_at} />
                  </span>
                </span>
              </>
            );
            return (
              <li key={e.id}>
                {e.href ? (
                  <Link href={e.href} className="flex gap-3 rounded-lg px-1.5 py-2 hover:bg-muted/60">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex gap-3 px-1.5 py-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

