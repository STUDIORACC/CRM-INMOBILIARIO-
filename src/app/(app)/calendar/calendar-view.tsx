"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, addMonths, eachDayOfInterval, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarCheck, CalendarClock, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, ExternalLink, MapPin, MessageCircle, Phone, Users, XCircle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { confirmVisitAction } from "@/actions/visits";
import { setTaskStatusAction } from "@/actions/tasks";
import { useQuickActions } from "@/components/quick/quick-actions";
import { VisitStatusBadge } from "@/components/shared/badges";
import { UserChip } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUrlParams } from "@/hooks/use-url-params";
import { fmtDate, fmtLongDate, fmtTime, tz } from "@/lib/domain/dates";
import type { CalendarEvent, CalendarKind } from "@/lib/services/calendar";
import { cn } from "@/lib/utils";

type View = "month" | "week" | "day";

const KINDS: Record<CalendarKind, { label: string; icon: LucideIcon; chip: string; block: string; dot: string }> = {
  visit: { label: "Visitas", icon: MapPin, chip: "bg-amber-50 text-amber-800 border-amber-200", block: "bg-amber-100 border-amber-400 text-amber-950", dot: "bg-amber-500" },
  task: { label: "Tareas", icon: CheckSquare, chip: "bg-teal-50 text-teal-800 border-teal-200", block: "bg-teal-100 border-teal-400 text-teal-950", dot: "bg-teal-500" },
  follow_up: { label: "Seguimientos", icon: CalendarClock, chip: "bg-pink-50 text-pink-800 border-pink-200", block: "bg-pink-100 border-pink-400 text-pink-950", dot: "bg-pink-500" },
  call: { label: "Llamadas / WhatsApp", icon: Phone, chip: "bg-blue-50 text-blue-800 border-blue-200", block: "bg-blue-100 border-blue-400 text-blue-950", dot: "bg-blue-500" },
  meeting: { label: "Reuniones", icon: Users, chip: "bg-violet-50 text-violet-800 border-violet-200", block: "bg-violet-100 border-violet-400 text-violet-950", dot: "bg-violet-500" },
};

const START_H = 7;
const END_H = 21;
const PX_H = 56;

function parseDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return startOfDay(tz(new Date(Date.UTC(y, m - 1, d, 12))));
}
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

function title(view: View, d: Date): string {
  if (view === "month") return format(d, "LLLL yyyy", { locale: es });
  if (view === "week") {
    const s = startOfWeek(d, { weekStartsOn: 1 });
    const e = addDays(s, 6);
    return `${format(s, "d", { locale: es })} – ${format(e, "d MMM yyyy", { locale: es })}`;
  }
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

export function CalendarView({ events, view, date, advisor, advisors, canFilter, today }: { events: CalendarEvent[]; view: View; date: string; advisor: string; advisors: Array<{ id: string; name: string }>; canFilter: boolean; today: string }) {
  const { update, pending } = useUrlParams();
  const [visible, setVisible] = useState<Set<CalendarKind>>(new Set(Object.keys(KINDS) as CalendarKind[]));
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const base = useMemo(() => parseDay(date), [date]);
  const todayDate = useMemo(() => parseDay(today), [today]);
  const shown = useMemo(() => events.filter((e) => visible.has(e.kind)), [events, visible]);

  const nav = (dir: -1 | 1) => {
    const next = view === "month" ? addMonths(base, dir) : addDays(base, dir * (view === "week" ? 7 : 1));
    update({ date: ymd(next) }, { resetPage: false });
  };
  const toggle = (k: CalendarKind) =>
    setVisible((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className={cn("space-y-4", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => nav(-1)} aria-label="Anterior">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" onClick={() => nav(1)} aria-label="Siguiente">
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => update({ date: today }, { resetPage: false })}>
            Hoy
          </Button>
        </div>
        <h2 className="min-w-0 flex-1 text-lg font-semibold first-letter:uppercase">{title(view, base)}</h2>
        {canFilter && (
          <Select value={advisor || "__all__"} onValueChange={(v) => update({ advisor: v === "__all__" ? null : v }, { resetPage: false })}>
            <SelectTrigger className="w-48" aria-label="Filtrar por vendedor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todo el equipo</SelectItem>
              {advisors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-card" role="group" aria-label="Vista del calendario">
          {(["day", "week", "month"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => update({ view: v }, { resetPage: false })} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipos de evento">
        {(Object.keys(KINDS) as CalendarKind[]).map((k) => {
          const on = visible.has(k);
          const Icon = KINDS[k].icon;
          const n = events.filter((e) => e.kind === k).length;
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => toggle(k)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity", KINDS[k].chip, !on && "opacity-40")}>
              <Icon className="size-3.5" /> {KINDS[k].label} <span className="tabular opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {view === "month" ? (
        <MonthGrid base={base} today={todayDate} events={shown} onSelect={setSelected} onDay={(d) => update({ view: "day", date: ymd(d) }, { resetPage: false })} />
      ) : (
        <TimeGrid days={view === "week" ? eachDayOfInterval({ start: startOfWeek(base, { weekStartsOn: 1 }), end: addDays(startOfWeek(base, { weekStartsOn: 1 }), 6) }) : [base]} today={todayDate} events={shown} onSelect={setSelected} onDay={(d) => update({ view: "day", date: ymd(d) }, { resetPage: false })} />
      )}

      <EventSheet event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function chipClass(e: CalendarEvent) {
  return cn("rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80", KINDS[e.kind].block, (e.status === "completed" || e.status === "cancelled") && "opacity-55 line-through", e.overdue && "ring-1 ring-rose-400");
}

function MonthGrid({ base, today, events, onSelect, onDay }: { base: Date; today: Date; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void; onDay: (d: Date) => void }) {
  const start = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end: addDays(start, 41) });
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = ymd(tz(e.start));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    // En la cuadrícula del mes las visitas y reuniones van primero; luego por hora
    const rank: Record<CalendarKind, number> = { visit: 0, meeting: 1, call: 2, follow_up: 3, task: 4 };
    for (const list of m.values()) list.sort((x, y) => rank[x.kind] - rank[y.kind] || x.start.localeCompare(y.start));
    return m;
  }, [events]);
  const [dayList, setDayList] = useState<Date>(today);
  const listEvents = byDay.get(ymd(dayList)) ?? [];

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const list = byDay.get(ymd(d)) ?? [];
            const out = !isSameMonth(d, base);
            const isToday = isSameDay(d, today);
            return (
              <div key={i} className={cn("min-h-[5.5rem] border-r border-b p-1 last:border-r-0 sm:min-h-[7.5rem] sm:p-1.5", out && "bg-muted/30", i % 7 === 6 && "border-r-0")} onClick={() => setDayList(d)}>
                <button type="button" onClick={() => onDay(d)} className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs font-medium tabular hover:bg-muted", isToday && "bg-primary text-primary-foreground hover:bg-primary", out && !isToday && "text-muted-foreground")} aria-label={`Ver ${fmtLongDate(d)}`}>
                  {format(d, "d")}
                </button>
                {/* Escritorio: chips; móvil: puntos */}
                <div className="hidden space-y-1 sm:block">
                  {list.slice(0, 3).map((e) => (
                    <button key={e.id} type="button" onClick={(ev) => { ev.stopPropagation(); onSelect(e); }} className={cn(chipClass(e), "block w-full truncate")} title={`${fmtTime(e.start)} ${e.title}`}>
                      <b className="tabular">{fmtTime(e.start).replace(/\s?[ap]\.\s?m\./i, "")}</b> {e.title}
                    </button>
                  ))}
                  {list.length > 3 && (
                    <button type="button" onClick={() => onDay(d)} className="px-1 text-[11px] font-medium text-primary hover:underline">
                      +{list.length - 3} más
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {list.slice(0, 6).map((e) => (
                    <span key={e.id} className={cn("size-1.5 rounded-full", KINDS[e.kind].dot)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Agenda del día seleccionado (útil en móvil) */}
      <section className="rounded-xl border bg-card p-4 shadow-card sm:hidden">
        <h3 className="mb-2 text-sm font-semibold first-letter:uppercase">{fmtLongDate(dayList)}</h3>
        {listEvents.length === 0 ? <p className="text-sm text-muted-foreground">No hay actividades este día.</p> : <ul className="space-y-1.5">{listEvents.map((e) => <li key={e.id}><button type="button" onClick={() => onSelect(e)} className={cn(chipClass(e), "block w-full px-2 py-1.5 text-xs")}><b>{fmtTime(e.start)}</b> · {e.title}</button></li>)}</ul>}
      </section>
    </>
  );
}

interface Placed {
  e: CalendarEvent;
  col: number;
  cols: number;
  /** Cuando hay más eventos solapados de los que caben, el último carril los agrupa. */
  more?: CalendarEvent[];
}

function layoutDay(list: CalendarEvent[], maxCols: number): Placed[] {
  const items = [...list].sort((a, b) => a.start.localeCompare(b.start));
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = 0;
  const flush = () => {
    const need = Math.max(1, ...group.map((g) => g.col + 1));
    if (need <= maxCols) {
      group.forEach((g) => (g.cols = need));
      placed.push(...group);
    } else {
      const keep = group.filter((g) => g.col < maxCols - 1);
      const rest = group.filter((g) => g.col >= maxCols - 1);
      keep.forEach((g) => (g.cols = maxCols));
      placed.push(...keep);
      const starts = rest.map((g) => new Date(g.e.start).getTime());
      const ends = rest.map((g) => Math.max(new Date(g.e.end).getTime(), new Date(g.e.start).getTime() + 30 * 60_000));
      const first = rest.reduce((a, g) => (g.e.start < a.start ? g.e : a), rest[0].e);
      placed.push({ e: { ...first, end: new Date(Math.max(...ends)).toISOString(), start: new Date(Math.min(...starts)).toISOString() }, col: maxCols - 1, cols: maxCols, more: rest.map((g) => g.e) });
    }
    group = [];
  };
  for (const e of items) {
    const s = new Date(e.start).getTime();
    const en = Math.max(new Date(e.end).getTime(), s + 30 * 60_000);
    if (group.length && s >= groupEnd) flush();
    const used = new Set(group.filter((g) => Math.max(new Date(g.e.end).getTime(), new Date(g.e.start).getTime() + 30 * 60_000) > s).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ e, col, cols: 1 });
    groupEnd = Math.max(groupEnd, en);
  }
  if (group.length) flush();
  return placed;
}

function TimeGrid({ days, today, events, onSelect, onDay }: { days: Date[]; today: Date; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void; onDay: (d: Date) => void }) {
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = ymd(tz(e.start));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [events]);
  const nowT = tz();
  const nowTop = ((nowT.getHours() * 60 + nowT.getMinutes() - START_H * 60) / 60) * PX_H;
  const multi = days.length > 1;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="overflow-x-auto">
        <div style={{ minWidth: multi ? 760 : 0 }}>
          <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <button key={ymd(d)} type="button" onClick={() => onDay(d)} className="border-l py-2 text-center hover:bg-muted">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{format(d, "EEE", { locale: es })}</div>
                <div className={cn("mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular", isSameDay(d, today) && "bg-primary text-primary-foreground")}>{format(d, "d")}</div>
              </button>
            ))}
          </div>
          <div className="relative grid max-h-[70vh] overflow-y-auto" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
            <div>
              {hours.map((h) => (
                <div key={h} className="relative border-b text-right text-[11px] text-muted-foreground tabular" style={{ height: PX_H }}>
                  <span className="absolute -top-2 right-2 bg-card px-0.5">{h % 12 === 0 ? 12 : h % 12} {h < 12 ? "a. m." : "p. m."}</span>
                </div>
              ))}
            </div>
            {days.map((d) => {
              const placed = layoutDay(byDay.get(ymd(d)) ?? [], multi ? 3 : 6);
              return (
                <div key={ymd(d)} className="relative border-l" style={{ height: hours.length * PX_H }}>
                  {hours.map((h) => (
                    <div key={h} className="border-b border-dashed border-border/70" style={{ height: PX_H }} />
                  ))}
                  {isSameDay(d, today) && nowTop > 0 && nowTop < hours.length * PX_H && (
                    <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                      <span className="-ml-1 size-2 rounded-full bg-rose-500" />
                      <span className="h-px flex-1 bg-rose-500" />
                    </div>
                  )}
                  {placed.map(({ e, col, cols, more }) => {
                    const s = tz(e.start);
                    const mins = s.getHours() * 60 + s.getMinutes() - START_H * 60;
                    const dur = Math.max(30, Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000));
                    const top = Math.max(0, (mins / 60) * PX_H);
                    const height = Math.max(24, (dur / 60) * PX_H - 2);
                    const Icon = KINDS[e.kind].icon;
                    if (more) {
                      return (
                        <button key={"more-" + e.id} type="button" onClick={() => onDay(d)} className="absolute overflow-hidden rounded border border-dashed border-primary/50 bg-primary/5 px-1.5 py-0.5 text-left text-[11px] font-semibold text-primary hover:bg-primary/10" style={{ top, height: Math.max(24, height), left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }} title={`${more.length} actividades más a esta hora: abrir el día`}>
                          +{more.length} más
                        </button>
                      );
                    }
                    return (
                      <button key={e.id} type="button" onClick={() => onSelect(e)} className={cn(chipClass(e), "absolute overflow-hidden")} style={{ top, height, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` }} title={`${fmtTime(e.start)} · ${e.title}`}>
                        <span className="flex items-center gap-1 font-semibold">
                          <Icon className="size-3 shrink-0" />
                          <span className="truncate">{e.title}</span>
                        </span>
                        {height > 36 && <span className="block truncate opacity-80">{fmtTime(e.start)}{e.subtitle ? ` · ${e.subtitle}` : ""}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {days.length === 1 && (byDay.get(ymd(days[0])) ?? []).length === 0 && <p className="border-t px-4 py-3 text-center text-sm text-muted-foreground">No hay actividades programadas este día.</p>}
    </div>
  );
}

function EventSheet({ event: e, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const { open } = useQuickActions();
  if (!e) return null;
  const meta = KINDS[e.kind];
  const Icon = meta.icon;
  const isVisit = e.source === "visit";
  const activeVisit = isVisit && ["scheduled", "confirmed"].includes(e.status);
  const partyHref = e.leadId ? `/leads/${e.leadId}` : e.clientId ? `/clients/${e.clientId}` : null;
  const label = e.propertyCode ? `${e.propertyCode} · ${e.propertyTitle ?? ""}` : undefined;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-center gap-2">
            <span className={cn("flex size-8 items-center justify-center rounded-lg border", meta.chip)}>
              <Icon className="size-4" />
            </span>
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{meta.label.replace(/s$/, "")}</span>
            {isVisit && <VisitStatusBadge value={e.status} />}
            {!isVisit && e.status === "completed" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Completada</span>}
            {e.overdue && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">{isVisit ? "Falta resultado" : "Vencida"}</span>}
          </div>
          <SheetTitle className="text-lg">{e.title}</SheetTitle>
          <SheetDescription className="first-letter:uppercase">
            {fmtLongDate(e.start)} · {fmtTime(e.start)}
            {isVisit ? ` – ${fmtTime(e.end)}` : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          {e.partyName && partyHref && (
            <Row label={e.leadId ? "Lead" : "Cliente"}>
              <Link href={partyHref} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                {e.partyName} <ExternalLink className="size-3" />
              </Link>
            </Row>
          )}
          {e.propertyId && (
            <Row label="Propiedad">
              <Link href={`/properties/${e.propertyId}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                {label} <ExternalLink className="size-3" />
              </Link>
              {e.propertyAddress && <div className="text-xs text-muted-foreground">{e.propertyAddress}</div>}
            </Row>
          )}
          {e.opportunityId && (
            <Row label="Oportunidad">
              <Link href={`/opportunities/${e.opportunityId}`} className="font-medium text-primary hover:underline">
                Ver oportunidad
              </Link>
            </Row>
          )}
          <Row label="Responsable">
            <UserChip userId={e.advisorId} size="sm" />
          </Row>
          {!isVisit && e.subtitle && <Row label="Relacionado con">{e.subtitle}</Row>}

          <div className="flex flex-col gap-2 border-t pt-4">
            {isVisit && e.partyPhone && activeVisit && (
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  open("whatsapp", { phone: e.partyPhone, name: e.partyName ?? "", leadId: e.leadId ?? undefined, clientId: e.clientId ?? undefined, opportunityId: e.opportunityId ?? undefined, propertyId: e.propertyId ?? undefined, propertyLabel: label, visit: { dateIso: e.start, address: e.propertyAddress, propertyTitle: e.propertyTitle ?? undefined, propertyCode: e.propertyCode ?? undefined }, category: "confirm_visit" });
                }}
              >
                <MessageCircle className="text-emerald-600" /> {e.status === "scheduled" ? "Confirmar por WhatsApp" : "Recordar por WhatsApp"}
              </Button>
            )}
            {activeVisit && e.status === "scheduled" && (
              <Button
                variant="outline"
                onClick={async () => {
                  const res = await confirmVisitAction({ id: e.id });
                  if (res.ok) {
                    toast.success(res.message);
                    onClose();
                  } else toast.error(res.error);
                }}
              >
                <CalendarCheck /> Marcar como confirmada
              </Button>
            )}
            {activeVisit && (
              <>
                <Button onClick={() => { onClose(); open("visit-result", { visitId: e.id, propertyLabel: label, partyName: e.partyName ?? undefined }); }}>Registrar resultado</Button>
                <Button variant="outline" onClick={() => { onClose(); open("visit", { visitId: e.id, reschedule: true, leadId: e.leadId ?? undefined, clientId: e.clientId ?? undefined }); }}>
                  <CalendarClock /> Reprogramar
                </Button>
                <Button variant="ghost" className="text-destructive" onClick={() => { onClose(); open("visit-cancel", { visitId: e.id, propertyLabel: label, partyName: e.partyName ?? undefined }); }}>
                  <XCircle /> Cancelar / no asistió
                </Button>
              </>
            )}
            {!isVisit && ["pending", "in_progress", "overdue"].includes(e.status) && (
              <Button
                onClick={async () => {
                  const res = await setTaskStatusAction({ id: e.id, status: "completed" });
                  if (res.ok) {
                    toast.success(res.message);
                    onClose();
                  } else toast.error(res.error);
                }}
              >
                <CheckSquare /> Completar tarea
              </Button>
            )}
            {partyHref && (
              <Button variant="ghost" asChild>
                <Link href={partyHref}>
                  <CalendarDays /> Abrir {e.leadId ? "lead" : "cliente"}
                </Link>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{fmtDate(e.start)}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
