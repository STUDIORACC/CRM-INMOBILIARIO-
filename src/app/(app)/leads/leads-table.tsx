"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, CheckSquare, MoreHorizontal, Pencil, RotateCcw, StickyNote, Tag, Target, Trash2, UserCheck, UserRoundCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { assignLeadsAction, deleteLeadAction, reactivateLeadAction } from "@/actions/leads";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCan, useLookups, useSession } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { ConfirmDialog } from "@/components/shared/app-dialog";
import { LeadStageBadge, PriorityBadge, TagChip, TemperatureBadge } from "@/components/shared/badges";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar, UserChip } from "@/components/shared/user-avatar";
import { OPERATION_TYPES, labelOf } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";
import { leadNextAction } from "@/lib/domain/next-action";
import type { LeadListRow } from "@/lib/services/leads";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

const TONE = { danger: "text-rose-600", warning: "text-amber-700", ok: "text-foreground", muted: "text-muted-foreground" } as const;

export function NextActionCell({ lead }: { lead: LeadListRow }) {
  const a = leadNextAction({ ...lead, first_contacted_at: lead.last_activity_at });
  return (
    <div className="min-w-0 max-w-[15rem]">
      <div className={cn("truncate text-[13px] font-medium", TONE[a.tone])}>{a.text}</div>
      {a.when ? <div className="text-xs text-muted-foreground">{a.when}</div> : a.hint ? <div className="truncate text-xs text-muted-foreground" title={a.hint}>{a.hint}</div> : null}
    </div>
  );
}

function interestText(l: LeadListRow, lookups: ReturnType<typeof useLookups>): { main: string; sub: string } {
  const op = l.operation_type ? labelOf(OPERATION_TYPES, l.operation_type) : null;
  const type = l.property_type ? lookups.propertyType(l.property_type) : null;
  const budget = l.budget_max ? `hasta ${formatMoneyCompact(l.budget_max, l.currency)}` : l.budget_min ? `desde ${formatMoneyCompact(l.budget_min, l.currency)}` : null;
  return { main: [op, type].filter(Boolean).join(" · ") || "Sin definir", sub: [l.districts.length ? lookups.districts(l.districts.slice(0, 2)) + (l.districts.length > 2 ? "…" : "") : null, budget].filter(Boolean).join(" · ") };
}

export function LeadRowMenu({ lead }: { lead: LeadListRow }) {
  const { open } = useQuickActions();
  const can = { assign: useCan("leads.assign_any"), del: useCan("leads.delete"), opp: useCan("opportunities.access") };
  const session = useSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canTake = !lead.assigned_to && !can.assign;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${lead.full_name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href={`/leads/${lead.id}`}>Abrir ficha</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("lead", { leadId: lead.id })}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => open("activity", { leadId: lead.id, leadName: lead.full_name, type: "call" })}>
            <StickyNote /> Registrar actividad
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("task", { leadId: lead.id, leadName: lead.full_name })}>
            <CheckSquare /> Crear tarea / seguimiento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("visit", { leadId: lead.id, leadName: lead.full_name, propertyId: lead.property_id ?? undefined, propertyLabel: lead.property_code ?? undefined })}>
            <CalendarPlus /> Agendar visita
          </DropdownMenuItem>
          {can.opp && lead.stage !== "lost" && (
            <DropdownMenuItem onSelect={() => open("opportunity", { leadId: lead.id, leadName: lead.full_name, propertyId: lead.property_id ?? undefined, propertyLabel: lead.property_code ?? undefined })}>
              <Target /> Crear oportunidad
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {(can.assign || canTake) && (
            <DropdownMenuItem
              onSelect={async () => {
                if (canTake) {
                  const res = await assignLeadsAction({ ids: [lead.id], userId: session.id });
                  if (res.ok) toast.success("Lead asignado a ti");
                  else toast.error(res.error);
                } else open("assign", { entity: "lead", ids: [lead.id], currentUserId: lead.assigned_to, label: lead.full_name });
              }}
            >
              <UserCheck /> {canTake ? "Tomar este lead" : "Asignar vendedor"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => open("tags", { entity: "lead", id: lead.id, current: lead.tags.map((t) => t.id) })}>
            <Tag /> Etiquetas
          </DropdownMenuItem>
          {!lead.client_id && lead.stage !== "lost" && (
            <DropdownMenuItem onSelect={() => open("convert", { leadId: lead.id, leadName: lead.full_name })}>
              <UserRoundCheck /> Convertir en cliente
            </DropdownMenuItem>
          )}
          {lead.stage === "lost" ? (
            <DropdownMenuItem
              onSelect={async () => {
                const res = await reactivateLeadAction({ id: lead.id });
                if (res.ok) toast.success(res.message);
                else toast.error(res.error);
              }}
            >
              <RotateCcw /> Reactivar lead
            </DropdownMenuItem>
          ) : (
            lead.stage !== "won" && (
              <DropdownMenuItem onSelect={() => open("lost", { entity: "lead", id: lead.id, name: lead.full_name })}>
                <XCircle /> Marcar como perdido
              </DropdownMenuItem>
            )
          )}
          {can.del && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> Eliminar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar este lead?"
        description={`Se eliminará "${lead.full_name}" con sus actividades y tareas. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar lead"
        destructive
        onConfirm={async () => {
          const res = await deleteLeadAction({ id: lead.id });
          if (res.ok) toast.success(res.message);
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      />
    </>
  );
}

export function LeadsTable({ rows, total, page, pageSize, sort, dir }: { rows: LeadListRow[]; total: number; page: number; pageSize: number; sort: string; dir: "asc" | "desc" }) {
  const lookups = useLookups();
  const { open } = useQuickActions();
  const canAssign = useCan("leads.assign_any");
  const session = useSession();

  const columns: Column<LeadListRow>[] = [
    {
      id: "lead",
      header: "Lead",
      sortKey: "full_name",
      cell: (l) => (
        <div className="flex min-w-[13rem] items-center gap-3">
          <UserAvatar name={l.full_name} size="md" />
          <div className="min-w-0">
            <Link href={`/leads/${l.id}`} className="block truncate text-sm font-semibold hover:text-primary">
              {l.full_name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <TemperatureBadge score={l.score} temperature={l.temperature} />
              {l.client_id && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">Cliente</span>}
              {l.tags.slice(0, 2).map((t) => (
                <TagChip key={t.id} name={t.name} color={t.color} />
              ))}
              {l.tags.length > 2 && <span className="text-[11px] text-muted-foreground">+{l.tags.length - 2}</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contacto",
      hideBelow: "xl",
      cell: (l) => (
        <div className="text-sm">
          <div className="tabular">{l.phone ? formatPhone(l.phone) : <span className="text-muted-foreground">—</span>}</div>
          <div className="max-w-[12rem] truncate text-xs text-muted-foreground">{l.email ?? "Sin email"}</div>
        </div>
      ),
    },
    { id: "source", header: "Fuente", hideBelow: "lg", cell: (l) => <span className="text-sm">{lookups.source(l.source)}</span> },
    {
      id: "interest",
      header: "Interés",
      hideBelow: "xl",
      cell: (l) => {
        const t = interestText(l, lookups);
        return (
          <div className="max-w-[14rem] text-sm">
            <div className="truncate">{t.main}</div>
            <div className="truncate text-xs text-muted-foreground">{t.sub || "—"}</div>
          </div>
        );
      },
    },
    {
      id: "property",
      header: "Propiedad",
      hideBelow: "lg",
      cell: (l) =>
        l.property_id ? (
          <Link href={`/properties/${l.property_id}`} className="block max-w-[11rem] hover:text-primary">
            <div className="text-sm font-medium">{l.property_code}</div>
            <div className="truncate text-xs text-muted-foreground">{l.property_title}</div>
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "advisor", header: "Vendedor", hideBelow: "lg", cell: (l) => <UserChip userId={l.assigned_to} /> },
    { id: "stage", header: "Etapa", sortKey: "stage", cell: (l) => <LeadStageBadge value={l.stage} /> },
    { id: "priority", header: "Prioridad", sortKey: "priority", hideBelow: "md", cell: (l) => <PriorityBadge value={l.priority} /> },
    { id: "activity", header: "Última actividad", sortKey: "last_activity_at", hideBelow: "xl", cell: (l) => <RelativeTime value={l.last_activity_at} className="text-sm text-muted-foreground" fallback="Sin actividad" /> },
    { id: "next", header: "Próxima acción", sortKey: "next_follow_up_at", cell: (l) => <NextActionCell lead={l} /> },
    { id: "created", header: "Creado", sortKey: "created_at", hideBelow: "xl", cell: (l) => <span className="text-sm text-muted-foreground tabular">{fmtDate(l.created_at)}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      sort={sort}
      dir={dir}
      rowKey={(l) => l.id}
      rowHref={(l) => `/leads/${l.id}`}
      selectable
      bulkActions={(ids, clear) => (
        <Button
          size="sm"
          onClick={async () => {
            if (canAssign) {
              open("assign", { entity: "lead", ids });
              clear();
            } else {
              const res = await assignLeadsAction({ ids, userId: session.id });
              if (res.ok) {
                toast.success(res.message);
                clear();
              } else toast.error(res.error);
            }
          }}
        >
          <UserCheck /> {canAssign ? "Asignar vendedor" : "Tomar leads"}
        </Button>
      )}
      rowActions={(l) => <LeadRowMenu lead={l} />}
      empty={<EmptyState icon={<Users className="size-5" />} title="No hay leads con estos filtros" description="Prueba cambiando los filtros o registra un nuevo lead." />}
      mobileCard={(l) => (
        <div className="rounded-xl border bg-card p-3.5 shadow-card">
          <div className="flex items-start gap-3">
            <UserAvatar name={l.full_name} size="md" />
            <div className="min-w-0 flex-1">
              <Link href={`/leads/${l.id}`} className="block truncate text-[15px] font-semibold">
                {l.full_name}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <LeadStageBadge value={l.stage} />
                <TemperatureBadge score={l.score} temperature={l.temperature} />
                <PriorityBadge value={l.priority} />
              </div>
            </div>
            <LeadRowMenu lead={l} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div className="text-muted-foreground">Fuente: <span className="text-foreground">{lookups.source(l.source)}</span></div>
            <div className="truncate text-muted-foreground">Vendedor: <span className="text-foreground">{lookups.userName(l.assigned_to)}</span></div>
            {l.property_code && <div className="text-muted-foreground">Propiedad: <span className="text-foreground">{l.property_code}</span></div>}
            {l.budget_max && <div className="text-muted-foreground">Presupuesto: <span className="text-foreground">{formatMoney(l.budget_max, l.currency)}</span></div>}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <NextActionCell lead={l} />
            <ContactButtons phone={l.phone} email={l.email} name={l.full_name} leadId={l.id} propertyId={l.property_id ?? undefined} propertyLabel={l.property_code ?? undefined} />
          </div>
        </div>
      )}
    />
  );
}

