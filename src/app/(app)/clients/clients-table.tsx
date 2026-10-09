"use client";

import Link from "next/link";
import { UserCheck } from "lucide-react";
import { useLookups } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { TagChip } from "@/components/shared/badges";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { RelativeTime } from "@/components/shared/relative-time";
import { EmptyState } from "@/components/shared/states";
import { UserAvatar, UserChip } from "@/components/shared/user-avatar";
import { OPERATION_TYPES, labelOf } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import { formatMoneyCompact } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";
import type { ClientListRow } from "@/lib/services/clients";

export function ClientsTable({ rows, total, page, pageSize, sort, dir }: { rows: ClientListRow[]; total: number; page: number; pageSize: number; sort: string; dir: "asc" | "desc" }) {
  const lookups = useLookups();
  const { open } = useQuickActions();
  const search = (c: ClientListRow) => {
    const op = c.operation_type ? labelOf(OPERATION_TYPES, c.operation_type) : null;
    const budget = c.budget_max ? `hasta ${formatMoneyCompact(c.budget_max, c.currency)}` : null;
    return { main: [op, c.property_type ? lookups.propertyType(c.property_type) : null].filter(Boolean).join(" · ") || "Sin definir", sub: [c.districts.length ? lookups.districts(c.districts.slice(0, 2)) : null, budget].filter(Boolean).join(" · ") };
  };

  const columns: Column<ClientListRow>[] = [
    {
      id: "client",
      header: "Cliente",
      sortKey: "full_name",
      cell: (c) => (
        <div className="flex min-w-[13rem] items-center gap-3">
          <UserAvatar name={c.full_name} src={c.avatar_url} size="md" />
          <div className="min-w-0">
            <Link href={`/clients/${c.id}`} className="block truncate text-sm font-semibold hover:text-primary">
              {c.full_name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {c.doc_number && <span className="text-xs text-muted-foreground">{c.doc_type?.toUpperCase()} {c.doc_number}</span>}
              {c.tags.slice(0, 2).map((t) => (
                <TagChip key={t.id} name={t.name} color={t.color} />
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contacto",
      hideBelow: "lg",
      cell: (c) => (
        <div className="text-sm">
          <div className="tabular">{c.phone ? formatPhone(c.phone) : "—"}</div>
          <div className="max-w-[12rem] truncate text-xs text-muted-foreground">{c.email ?? "Sin email"}</div>
        </div>
      ),
    },
    {
      id: "search",
      header: "Búsqueda",
      hideBelow: "xl",
      cell: (c) => {
        const s = search(c);
        return (
          <div className="max-w-[15rem] text-sm">
            <div className="truncate">{s.main}</div>
            <div className="truncate text-xs text-muted-foreground">{s.sub || "—"}</div>
          </div>
        );
      },
    },
    { id: "advisor", header: "Asesor", hideBelow: "lg", cell: (c) => <UserChip userId={c.assigned_to} /> },
    {
      id: "opps",
      header: "Oportunidades",
      align: "right",
      hideBelow: "md",
      cell: (c) => <span className="text-sm tabular">{c.open_opportunities > 0 ? <b>{c.open_opportunities}</b> : "—"}</span>,
    },
    { id: "visits", header: "Visitas", align: "right", hideBelow: "xl", cell: (c) => <span className="text-sm tabular">{c.visits_done || "—"}</span> },
    { id: "activity", header: "Última actividad", sortKey: "last_activity_at", hideBelow: "xl", cell: (c) => <RelativeTime value={c.last_activity_at} className="text-sm text-muted-foreground" fallback="Sin actividad" /> },
    { id: "created", header: "Alta", sortKey: "created_at", hideBelow: "xl", cell: (c) => <span className="text-sm text-muted-foreground tabular">{fmtDate(c.created_at)}</span> },
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
      rowKey={(c) => c.id}
      rowHref={(c) => `/clients/${c.id}`}
      empty={<EmptyState icon={<UserCheck className="size-5" />} title="No hay clientes con estos filtros" description="Convierte un lead en cliente o registra uno nuevo." action={<button className="text-sm font-medium text-primary hover:underline" onClick={() => open("client", {})}>Registrar cliente</button>} />}
      mobileCard={(c) => (
        <div className="rounded-xl border bg-card p-3.5 shadow-card">
          <div className="flex items-start gap-3">
            <UserAvatar name={c.full_name} src={c.avatar_url} size="md" />
            <div className="min-w-0 flex-1">
              <Link href={`/clients/${c.id}`} className="block truncate text-[15px] font-semibold">
                {c.full_name}
              </Link>
              <div className="text-xs text-muted-foreground">{c.phone ? formatPhone(c.phone) : c.email ?? "Sin contacto"}</div>
            </div>
          </div>
          <div className="mt-2.5 text-xs text-muted-foreground">
            {search(c).main} {search(c).sub ? `· ${search(c).sub}` : ""}
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className="text-xs text-muted-foreground">{c.open_opportunities} oportunidades · {c.visits_done} visitas</span>
            <ContactButtons phone={c.phone} email={c.email} name={c.full_name} clientId={c.id} />
          </div>
        </div>
      )}
    />
  );
}
