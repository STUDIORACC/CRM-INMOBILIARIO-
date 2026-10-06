"use client";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { OptBadge } from "@/components/shared/badges";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { DOC_TYPES, OWNER_TYPES, labelOf } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import { formatPhone } from "@/lib/domain/phone";
import type { OwnerListRow } from "@/lib/services/owners";

export function OwnersTable({ rows, total, page, pageSize, sort, dir }: { rows: OwnerListRow[]; total: number; page: number; pageSize: number; sort: string; dir: "asc" | "desc" }) {
  const columns: Column<OwnerListRow>[] = [
    {
      id: "owner",
      header: "Propietario",
      sortKey: "full_name",
      cell: (o) => (
        <div className="flex min-w-[14rem] items-center gap-3">
          <UserAvatar name={o.full_name} size="md" />
          <div className="min-w-0">
            <Link href={`/owners/${o.id}`} className="block truncate text-sm font-semibold hover:text-primary">
              {o.full_name}
            </Link>
            <div className="text-xs text-muted-foreground">{o.doc_number ? `${o.doc_type ? labelOf(DOC_TYPES, o.doc_type) : "Doc."} ${o.doc_number}` : "Sin documento"}</div>
          </div>
        </div>
      ),
    },
    { id: "type", header: "Tipo", hideBelow: "lg", cell: (o) => <OptBadge list={OWNER_TYPES} value={o.owner_type} dot={false} /> },
    {
      id: "contact",
      header: "Contacto",
      hideBelow: "md",
      cell: (o) => (
        <div className="text-sm">
          <div className="tabular">{o.phone ? formatPhone(o.phone) : "—"}</div>
          <div className="max-w-[13rem] truncate text-xs text-muted-foreground">{o.email ?? "Sin email"}</div>
        </div>
      ),
    },
    { id: "props", header: "Propiedades", sortKey: "properties", align: "right", cell: (o) => <span className="text-sm font-semibold tabular">{o.properties}</span> },
    { id: "active", header: "Activas", align: "right", hideBelow: "lg", cell: (o) => <span className="text-sm tabular">{o.active_properties}</span> },
    { id: "sold", header: "Vendidas", align: "right", hideBelow: "xl", cell: (o) => <span className="text-sm tabular">{o.sold_properties}</span> },
    { id: "rented", header: "Alquiladas", align: "right", hideBelow: "xl", cell: (o) => <span className="text-sm tabular">{o.rented_properties}</span> },
    { id: "created", header: "Registro", sortKey: "created_at", hideBelow: "xl", cell: (o) => <span className="text-sm text-muted-foreground tabular">{fmtDate(o.created_at)}</span> },
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
      rowHref={(o) => `/owners/${o.id}`}
      empty={<EmptyState icon={<KeyRound className="size-5" />} title="No hay propietarios con estos filtros" description="Registra al dueño de un inmueble para asociarle propiedades." />}
      mobileCard={(o) => (
        <Link href={`/owners/${o.id}`} className="block rounded-xl border bg-card p-3.5 shadow-card">
          <div className="flex items-center gap-3">
            <UserAvatar name={o.full_name} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{o.full_name}</div>
              <div className="text-xs text-muted-foreground">{o.phone ? formatPhone(o.phone) : o.email ?? "Sin contacto"}</div>
            </div>
            <div className="text-right">
              <div className="text-lg leading-none font-semibold tabular">{o.properties}</div>
              <div className="text-[11px] text-muted-foreground">propiedades</div>
            </div>
          </div>
        </Link>
      )}
    />
  );
}
