"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CheckSquare, Clock, GripVertical, MoreHorizontal, Move, StickyNote, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { moveOpportunityAction } from "@/actions/opportunities";
import { useLookups } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { PriorityBadge } from "@/components/shared/badges";
import { PropertyImage } from "@/components/shared/property-image";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { dayLabel, fmtRelative, fmtTime } from "@/lib/domain/dates";
import { formatMoneyCompact } from "@/lib/domain/money";
import type { OpportunityRow } from "@/lib/services/opportunities";
import type { StageDef } from "@/lib/types/catalogs";
import { cn } from "@/lib/utils";

interface Props {
  rows: OpportunityRow[];
  stages: StageDef[];
  staleDays: number;
  usdRate: number;
  currency: "PEN" | "USD";
}

const toBase = (r: OpportunityRow, base: "PEN" | "USD", rate: number) => (r.currency === base ? r.value : r.currency === "USD" ? r.value * rate : r.value / rate);

export function OpportunityBoard({ rows, stages, staleDays, usdRate, currency }: Props) {
  const lookups = useLookups();
  const { open } = useQuickActions();
  const [items, setItems] = useState(rows);
  const [syncedRows, setSyncedRows] = useState(rows);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Cuando el servidor entrega datos nuevos reemplazan la copia local (ajuste de estado durante el render)
  if (syncedRows !== rows) {
    setSyncedRows(rows);
    setItems(rows);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byStage = useMemo(() => {
    const m = new Map<string, OpportunityRow[]>();
    for (const s of stages) m.set(s.key, []);
    for (const r of items) m.get(r.stage)?.push(r);
    for (const list of m.values()) list.sort((a, b) => new Date(b.stage_changed_at).getTime() - new Date(a.stage_changed_at).getTime());
    return m;
  }, [items, stages]);

  const active = items.find((i) => i.id === activeId) ?? null;

  const move = async (row: OpportunityRow, target: string) => {
    const stage = stages.find((s) => s.key === target);
    if (!stage || row.stage === target) return;
    if (stage.kind === "lost") return open("lost", { entity: "opportunity", id: row.id, name: `${row.party_name} · ${row.property_code}` });
    if (stage.kind === "won") return open("won", { opportunityId: row.id, name: `${row.party_name} · ${row.property_code}`, value: row.value, currency: row.currency });
    const prev = items;
    setItems((cur) => cur.map((i) => (i.id === row.id ? { ...i, stage: target, probability: stage.defaultProbability, stage_changed_at: new Date().toISOString() } : i)));
    const res = await moveOpportunityAction({ id: row.id, stage: target });
    if (!res.ok) {
      setItems(prev);
      toast.error(res.error);
    } else toast.success(`Movida a “${stage.label}”`);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const target = e.over ? String(e.over.id) : null;
    const row = items.find((i) => i.id === id);
    if (row && target) void move(row, target);
  };

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" style={{ scrollSnapType: "x proximity" }}>
        <div className="flex min-h-[28rem] gap-3" style={{ width: "max-content" }}>
          {stages.map((s) => {
            const list = byStage.get(s.key) ?? [];
            const total = list.reduce((a, r) => a + toBase(r, currency, usdRate), 0);
            return (
              <Column key={s.key} stage={s} count={list.length} total={total} currency={currency}>
                {list.map((r) => (
                  <OppCard key={r.id} row={r} stages={stages} staleDays={staleDays} onMove={(t) => move(r, t)} lookups={lookups} />
                ))}
                {list.length === 0 && <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Sin oportunidades</div>}
              </Column>
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <OppCard row={active} stages={stages} staleDays={staleDays} onMove={() => undefined} lookups={lookups} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ stage, count, total, currency, children }: { stage: StageDef; count: number; total: number; currency: "PEN" | "USD"; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <section ref={setNodeRef} className={cn("flex w-[17.5rem] shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors sm:w-[18.5rem]", isOver && "border-primary/60 bg-primary/5")} style={{ scrollSnapAlign: "start" }} aria-label={`Etapa ${stage.label}`}>
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
          <h3 className="truncate text-[13px] font-semibold">{stage.label}</h3>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular">{count}</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular">{formatMoneyCompact(total, currency)}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">{children}</div>
    </section>
  );
}

function OppCard({ row, stages, staleDays, onMove, lookups, overlay = false }: { row: OpportunityRow; stages: StageDef[]; staleDays: number; onMove: (stage: string) => void; lookups: ReturnType<typeof useLookups>; overlay?: boolean }) {
  const { open } = useQuickActions();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id, disabled: overlay });
  const stage = stages.find((s) => s.key === row.stage);
  const closed = stage?.kind !== "open";
  const stale = !closed && row.days_idle >= staleDays;
  const [nowMs] = useState(() => Date.now());
  const label = `${row.party_name} · ${row.property_code}`;

  return (
    <article
      ref={setNodeRef}
      className={cn("group rounded-lg border bg-card p-3 shadow-card transition-shadow hover:shadow-md", isDragging && "opacity-40", overlay && "rotate-1 shadow-pop ring-2 ring-primary/40")}
      aria-label={label}
    >
      <div className="flex items-start gap-2">
        <button type="button" className="mt-0.5 -ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 hover:text-foreground active:cursor-grabbing" aria-label="Arrastrar para cambiar de etapa" {...listeners} {...attributes}>
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Link href={`/opportunities/${row.id}`} className="block truncate text-sm font-semibold hover:text-primary">
            {row.party_name}
          </Link>
          <Link href={`/properties/${row.property_id}`} className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <PropertyImage src={row.property_image} alt="" className="size-6 shrink-0 rounded" />
            <span className="truncate">
              {row.property_code} · {lookups.district(row.property_district)}
            </span>
          </Link>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Acciones: ${label}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href={`/opportunities/${row.id}`}>Abrir ficha completa</Link>
            </DropdownMenuItem>
            {!closed && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Move /> Mover a…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {stages.filter((s) => s.key !== row.stage).map((s) => (
                    <DropdownMenuItem key={s.key} onSelect={() => onMove(s.key)}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Registrar</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => open("task", { opportunityId: row.id, leadId: row.lead_id ?? undefined, clientId: row.client_id ?? undefined, propertyId: row.property_id, propertyLabel: label })}>
              <CheckSquare /> Crear tarea
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => open("activity", { opportunityId: row.id, leadId: row.lead_id ?? undefined, clientId: row.client_id ?? undefined, propertyId: row.property_id, type: "call" })}>
              <StickyNote /> Registrar actividad
            </DropdownMenuItem>
            {!closed && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onMove("won")}>
                  <Trophy /> Cerrar como ganada
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => onMove("lost")}>
                  <XCircle /> Marcar como perdida
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] leading-none font-semibold tabular">{formatMoneyCompact(row.value, row.currency)}</span>
            {row.operation === "rent" && (
              <span className="text-[10px] font-medium text-teal-700" title="Alquiler: se valoriza a 12 meses de renta">
                alquiler · 12 m
              </span>
            )}
          </div>
          {!closed && <div className="mt-1 text-[11px] text-muted-foreground tabular">{row.probability}% · pond. {formatMoneyCompact((row.value * row.probability) / 100, row.currency)}</div>}
        </div>
        <PriorityBadge value={row.priority} />
      </div>

      <div className="mt-2.5 space-y-1.5 border-t pt-2 text-xs">
        {!closed && (
          <div className={cn("flex items-center gap-1.5", row.next_activity_at && new Date(row.next_activity_at).getTime() < nowMs ? "font-medium text-rose-600" : "text-muted-foreground")}>
            <Clock className="size-3.5 shrink-0" />
            <span className="truncate">{row.next_activity_at ? `${row.next_activity_title ?? "Actividad"} · ${dayLabel(row.next_activity_at)} ${fmtTime(row.next_activity_at)}` : row.next_step ? row.next_step : "Sin próxima actividad"}</span>
          </div>
        )}
        {stage?.kind === "lost" && <div className="text-muted-foreground">Motivo: {lookups.lossReason(row.lost_reason)}</div>}
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <UserAvatar name={lookups.userName(row.assigned_to)} src={lookups.user(row.assigned_to)?.avatarUrl} size="xs" />
            <span className="truncate">{lookups.userName(row.assigned_to).split(" ")[0]}</span>
          </span>
          <span className={cn("shrink-0", stale && "font-medium text-amber-700")} title="Última actualización" suppressHydrationWarning>
            {stale ? `${row.days_idle} d sin actividad` : fmtRelative(row.updated_at)}
          </span>
        </div>
      </div>
    </article>
  );
}
