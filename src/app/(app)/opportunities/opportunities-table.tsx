"use client";

import Link from "next/link";
import { Target } from "lucide-react";
import { useLookups } from "@/components/providers/app-context";
import { ColorChip, PriorityBadge } from "@/components/shared/badges";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { UserChip } from "@/components/shared/user-avatar";
import { dayLabel, fmtDate, fmtRelative, fmtTime } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import type { OpportunityRow } from "@/lib/services/opportunities";

export function OpportunitiesTable({ rows, total, page, pageSize, sort, dir }: { rows: OpportunityRow[]; total: number; page: number; pageSize: number; sort: string; dir: "asc" | "desc" }) {
  const lookups = useLookups();
  const stageChip = (key: string) => {
    const s = lookups.stage(key);
    return <ColorChip color={s?.color ?? "#64748b"}>{s?.label ?? key}</ColorChip>;
  };
  const columns: Column<OpportunityRow>[] = [
    {
      id: "party",
      header: "Cliente / lead",
      cell: (o) => (
        <div className="min-w-0">
          <Link href={`/opportunities/${o.id}`} className="block truncate text-sm font-semibold hover:text-primary">
            {o.party_name}
          </Link>
          <div className="text-xs text-muted-foreground">{o.operation === "rent" ? "Alquiler" : "Venta"}</div>
        </div>
      ),
    },
    {
      id: "property",
      header: "Propiedad",
      cell: (o) => (
        <Link href={`/properties/${o.property_id}`} className="block max-w-[14rem] hover:text-primary">
          <div className="text-sm font-medium">{o.property_code}</div>
          <div className="truncate text-xs text-muted-foreground">{o.property_title}</div>
        </Link>
      ),
    },
    { id: "stage", header: "Etapa", cell: (o) => stageChip(o.stage) },
    { id: "value", header: "Valor", sortKey: "value", align: "right", cell: (o) => <span className="text-sm font-semibold tabular">{formatMoney(o.value, o.currency)}</span> },
    { id: "prob", header: "Prob.", sortKey: "probability", align: "right", hideBelow: "lg", cell: (o) => <span className="text-sm tabular">{o.probability}%</span> },
    { id: "advisor", header: "Vendedor", hideBelow: "lg", cell: (o) => <UserChip userId={o.assigned_to} /> },
    { id: "priority", header: "Prioridad", hideBelow: "xl", cell: (o) => <PriorityBadge value={o.priority} /> },
    {
      id: "next",
      header: "Próxima actividad",
      hideBelow: "xl",
      cell: (o) => (o.next_activity_at ? <span className="text-sm">{o.next_activity_title ?? "Actividad"} · {dayLabel(o.next_activity_at)} {fmtTime(o.next_activity_at)}</span> : <span className="text-sm text-muted-foreground">—</span>),
    },
    { id: "close", header: "Cierre estimado", sortKey: "expected_close_date", hideBelow: "xl", cell: (o) => <span className="text-sm text-muted-foreground tabular">{o.expected_close_date ? fmtDate(o.expected_close_date) : "—"}</span> },
    { id: "updated", header: "Actualizada", sortKey: "updated_at", hideBelow: "lg", cell: (o) => <span className="text-sm text-muted-foreground" suppressHydrationWarning>{fmtRelative(o.updated_at)}</span> },
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
      rowKey={(o) => o.id}
      rowHref={(o) => `/opportunities/${o.id}`}
      empty={<EmptyState icon={<Target className="size-5" />} title="No hay oportunidades con estos filtros" description="Crea una oportunidad desde un lead o desde el botón “Nueva oportunidad”." />}
      mobileCard={(o) => (
        <Link href={`/opportunities/${o.id}`} className="block rounded-xl border bg-card p-3.5 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{o.party_name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {o.property_code} · {o.property_title}
              </div>
            </div>
            {stageChip(o.stage)}
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="font-semibold tabular">{formatMoney(o.value, o.currency)}</span>
            <span className="text-xs text-muted-foreground">{o.probability}% · {lookups.userName(o.assigned_to).split(" ")[0]}</span>
          </div>
        </Link>
      )}
    />
  );
}
