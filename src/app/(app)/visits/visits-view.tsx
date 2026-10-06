"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Clock, MapPin, MessageCircle } from "lucide-react";
import { useLookups } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { VisitStatusBadge } from "@/components/shared/badges";
import { DataTable, type Column } from "@/components/shared/data-table";
import { VisitActions } from "@/components/shared/entity-lists";
import { PropertyImage } from "@/components/shared/property-image";
import { EmptyState } from "@/components/shared/states";
import { UserChip } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { VISIT_OUTCOMES, labelOf } from "@/lib/domain/constants";
import { dayLabel, fmtDate, fmtLongDate, fmtTime } from "@/lib/domain/dates";
import type { VisitRow } from "@/lib/services/visits";
import { cn } from "@/lib/utils";

function VisitCard({ v }: { v: VisitRow }) {
  const { open } = useQuickActions();
  const lookups = useLookups();
  const active = ["scheduled", "confirmed"].includes(v.status);
  const partyHref = v.lead_id ? `/leads/${v.lead_id}` : `/clients/${v.client_id}`;
  const label = `${v.property_code} · ${v.property_title}`;
  return (
    <article className={cn("flex gap-3 rounded-xl border bg-card p-3.5 shadow-card sm:gap-4", v.past_due && "border-rose-200 bg-rose-50/40")}>
      <div className="w-[4.25rem] shrink-0 rounded-lg bg-muted px-2 py-2 text-center leading-tight sm:w-20">
        <div className="text-base font-semibold tabular">{fmtTime(v.scheduled_at).replace(/\s?[ap]\.\s?m\./i, "")}</div>
        <div className="text-[10px] font-semibold uppercase text-muted-foreground">{/p\.\s?m/i.test(fmtTime(v.scheduled_at)) ? "p. m." : "a. m."}</div>
        <div className="mt-1 flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
          <Clock className="size-2.5" /> {v.duration_min} min
        </div>
      </div>
      <PropertyImage src={v.property_image} alt="" className="hidden size-16 shrink-0 rounded-lg sm:block" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={partyHref} className="truncate text-sm font-semibold hover:text-primary">
            {v.party_name}
          </Link>
          <VisitStatusBadge value={v.status} />
          {v.past_due && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">Falta registrar resultado</span>}
        </div>
        <Link href={`/properties/${v.property_id}`} className="mt-0.5 block truncate text-sm text-muted-foreground hover:text-foreground">
          <MapPin className="mr-1 inline size-3.5" />
          {label}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <UserChip userId={v.advisor_id} size="xs" className="max-w-[10rem]" />
          <span>{lookups.district(v.property_district)}</span>
          {v.outcome && <span className="font-medium text-foreground">Resultado: {labelOf(VISIT_OUTCOMES, v.outcome)}</span>}
          {v.observations && <span className="truncate italic">“{v.observations}”</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {active && (
          <>
            {v.past_due ? (
              <Button size="sm" onClick={() => open("visit-result", { visitId: v.id, propertyLabel: label, partyName: v.party_name })}>
                Registrar resultado
              </Button>
            ) : (
              v.party_phone && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    open("whatsapp", {
                      phone: v.party_phone,
                      name: v.party_name,
                      leadId: v.lead_id ?? undefined,
                      clientId: v.client_id ?? undefined,
                      opportunityId: v.opportunity_id ?? undefined,
                      propertyId: v.property_id,
                      propertyLabel: label,
                      visit: { dateIso: v.scheduled_at, address: v.property_address, propertyTitle: v.property_title, propertyCode: v.property_code },
                      category: "confirm_visit",
                    })
                  }
                >
                  <MessageCircle className="text-emerald-600" />
                  <span className="hidden sm:inline">{v.status === "scheduled" ? "Confirmar" : "Recordar"}</span>
                </Button>
              )
            )}
            <VisitActions visit={v} />
          </>
        )}
      </div>
    </article>
  );
}

/** Agenda agrupada por día. */
export function VisitsAgenda({ rows }: { rows: VisitRow[] }) {
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; rows: VisitRow[] }> = [];
    for (const v of rows) {
      const key = dayLabel(v.scheduled_at) === "Hoy" || dayLabel(v.scheduled_at) === "Mañana" || dayLabel(v.scheduled_at) === "Ayer" ? dayLabel(v.scheduled_at) : fmtDate(v.scheduled_at);
      const label = ["Hoy", "Mañana", "Ayer"].includes(key) ? `${key} · ${fmtLongDate(v.scheduled_at)}` : fmtLongDate(v.scheduled_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(v);
      else out.push({ key, label, rows: [v] });
    }
    return out;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState icon={<MapPin className="size-5" />} title="No hay visitas en este periodo" description="Cambia el rango de fechas o agenda una nueva visita." />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key + g.label}>
          <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
            <span className="first-letter:uppercase">{g.label}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{g.rows.length}</span>
          </h2>
          <div className="space-y-2.5">
            {g.rows.map((v) => (
              <VisitCard key={v.id} v={v} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function VisitsTable({ rows, total, page, pageSize }: { rows: VisitRow[]; total: number; page: number; pageSize: number }) {
  const lookups = useLookups();
  const columns: Column<VisitRow>[] = [
    { id: "when", header: "Fecha y hora", cell: (v) => <div className="text-sm"><div className="font-medium first-letter:uppercase">{dayLabel(v.scheduled_at)}</div><div className="text-xs text-muted-foreground tabular">{fmtDate(v.scheduled_at)} · {fmtTime(v.scheduled_at)}</div></div> },
    { id: "party", header: "Cliente / lead", cell: (v) => <Link href={v.lead_id ? `/leads/${v.lead_id}` : `/clients/${v.client_id}`} className="text-sm font-semibold hover:text-primary">{v.party_name}</Link> },
    { id: "property", header: "Propiedad", cell: (v) => <Link href={`/properties/${v.property_id}`} className="block max-w-[15rem] hover:text-primary"><div className="text-sm font-medium">{v.property_code}</div><div className="truncate text-xs text-muted-foreground">{v.property_title}</div></Link> },
    { id: "advisor", header: "Asesor", hideBelow: "lg", cell: (v) => <UserChip userId={v.advisor_id} /> },
    { id: "dur", header: "Duración", hideBelow: "xl", align: "right", cell: (v) => <span className="text-sm tabular">{v.duration_min} min</span> },
    { id: "status", header: "Estado", cell: (v) => <VisitStatusBadge value={v.status} /> },
    { id: "outcome", header: "Resultado", hideBelow: "lg", cell: (v) => <span className="text-sm">{v.outcome ? labelOf(VISIT_OUTCOMES, v.outcome) : v.past_due ? <span className="font-medium text-rose-600">Pendiente</span> : "—"}</span> },
    { id: "dist", header: "Distrito", hideBelow: "xl", cell: (v) => <span className="text-sm text-muted-foreground">{lookups.district(v.property_district)}</span> },
  ];
  return <DataTable columns={columns} rows={rows} total={total} page={page} pageSize={pageSize} rowKey={(v) => v.id} rowActions={(v) => <VisitActions visit={v} />} empty={<EmptyState icon={<MapPin className="size-5" />} title="No hay visitas con estos filtros" />} mobileCard={(v) => <VisitCard v={v} />} />;
}
