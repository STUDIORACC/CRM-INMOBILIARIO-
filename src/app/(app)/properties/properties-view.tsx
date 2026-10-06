"use client";

import Link from "next/link";
import { Bath, BedDouble, Building2, Car, Eye, MapPin, MessageSquare, MoreHorizontal, Pencil, Ruler, UserCheck } from "lucide-react";
import { useCan, useLookups, useSession } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { OptBadge, PropertyStatusBadge } from "@/components/shared/badges";
import { DataTable, Pagination, type Column } from "@/components/shared/data-table";
import { PropertyImage } from "@/components/shared/property-image";
import { EmptyState } from "@/components/shared/states";
import { UserAvatar, UserChip } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PROPERTY_OPERATIONS, PUBLICATION_STATUSES } from "@/lib/domain/constants";
import { fmtDate, fmtRelative } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import type { PropertyListRow } from "@/lib/services/properties";
import { useUrlParams } from "@/hooks/use-url-params";

const price = (p: PropertyListRow) => `${formatMoney(p.price, p.currency)}${p.operation === "rent" ? " /mes" : ""}`;

function RowMenu({ p }: { p: PropertyListRow }) {
  const { open } = useQuickActions();
  const canEdit = useCan("properties.edit_any");
  const session = useSession();
  const mine = p.advisor_id === session.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${p.code}`} className="bg-background/80 backdrop-blur-sm">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/properties/${p.id}`}>
            <Eye /> Ver ficha
          </Link>
        </DropdownMenuItem>
        {(canEdit || mine) && (
          <DropdownMenuItem asChild>
            <Link href={`/properties/${p.id}/edit`}>
              <Pencil /> Editar
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => open("visit", { propertyId: p.id, propertyLabel: `${p.code} · ${p.title}` })}>
          <MapPin /> Agendar visita
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("lead", { propertyId: p.id, propertyLabel: `${p.code} · ${p.title}` })}>
          <MessageSquare /> Registrar consulta (lead)
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem onSelect={() => open("assign", { entity: "property", ids: [p.id], currentUserId: p.advisor_id, label: `${p.code} · ${p.title}` })}>
            <UserCheck /> Cambiar asesor
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PropertyCard({ p }: { p: PropertyListRow }) {
  const lookups = useLookups();
  return (
    <article className="group relative overflow-hidden rounded-xl border bg-card shadow-card transition-shadow hover:shadow-md">
      <Link href={`/properties/${p.id}`} className="block">
        <div className="relative">
          <PropertyImage src={p.image} alt={p.title} className="aspect-[4/3] w-full transition-transform duration-300 group-hover:scale-[1.02]" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
            <span className="rounded-md bg-background/90 px-2 py-0.5 text-xs font-semibold shadow-sm backdrop-blur-sm">{p.code}</span>
            <PropertyStatusBadge value={p.status} />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
            <div className="text-lg leading-none font-semibold text-white tabular">{price(p)}</div>
          </div>
        </div>
        <div className="space-y-2 p-3.5">
          <h3 className="line-clamp-1 text-sm font-semibold group-hover:text-primary">{p.title}</h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{lookups.district(p.district)}{p.address ? ` · ${p.address}` : ""}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {p.bedrooms != null && (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="size-3.5" /> {p.bedrooms}
              </span>
            )}
            {p.bathrooms != null && (
              <span className="inline-flex items-center gap-1">
                <Bath className="size-3.5" /> {p.bathrooms}
              </span>
            )}
            {(p.total_area ?? p.built_area) != null && (
              <span className="inline-flex items-center gap-1">
                <Ruler className="size-3.5" /> {p.total_area ?? p.built_area} m²
              </span>
            )}
            {p.parking > 0 && (
              <span className="inline-flex items-center gap-1">
                <Car className="size-3.5" /> {p.parking}
              </span>
            )}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-2 border-t px-3.5 py-2.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <UserAvatar name={lookups.userName(p.advisor_id)} src={lookups.user(p.advisor_id)?.avatarUrl} size="xs" />
          <span className="truncate">{lookups.userName(p.advisor_id).split(" ")[0]}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span title="Consultas" className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" /> {p.inquiries}
          </span>
          <span title="Visitas realizadas" className="inline-flex items-center gap-1">
            <Eye className="size-3.5" /> {p.visits}
          </span>
        </span>
      </div>
      <div className="absolute top-12 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
        <RowMenu p={p} />
      </div>
    </article>
  );
}

export function PropertiesGrid({ rows, total, page, pageSize }: { rows: PropertyListRow[]; total: number; page: number; pageSize: number }) {
  const { update } = useUrlParams();
  if (total === 0) return <EmptyBlock />;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map((p) => (
          <PropertyCard key={p.id} p={p} />
        ))}
      </div>
      <Pagination page={page} lastPage={lastPage} total={total} from={(page - 1) * pageSize + 1} to={Math.min(total, page * pageSize)} pageSize={pageSize} onPage={(n) => update({ page: String(n) }, { resetPage: false })} />
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="rounded-xl border bg-card shadow-card">
      <EmptyState icon={<Building2 className="size-5" />} title="No hay propiedades con estos filtros" description="Ajusta los filtros o registra una nueva propiedad." />
    </div>
  );
}

export function PropertiesTable({ rows, total, page, pageSize, sort, dir }: { rows: PropertyListRow[]; total: number; page: number; pageSize: number; sort: string; dir: "asc" | "desc" }) {
  const lookups = useLookups();
  const columns: Column<PropertyListRow>[] = [
    {
      id: "code",
      header: "Propiedad",
      sortKey: "code",
      cell: (p) => (
        <div className="flex min-w-[15rem] items-center gap-3">
          <PropertyImage src={p.image} alt="" className="size-11 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <Link href={`/properties/${p.id}`} className="block truncate text-sm font-semibold hover:text-primary">
              {p.title}
            </Link>
            <div className="text-xs text-muted-foreground">{p.code} · {lookups.propertyType(p.property_type)}</div>
          </div>
        </div>
      ),
    },
    { id: "op", header: "Operación", hideBelow: "lg", cell: (p) => <OptBadge list={PROPERTY_OPERATIONS} value={p.operation} /> },
    { id: "price", header: "Precio", sortKey: "price", align: "right", cell: (p) => <span className="text-sm font-semibold tabular">{price(p)}</span> },
    {
      id: "loc",
      header: "Ubicación",
      sortKey: "district",
      hideBelow: "lg",
      cell: (p) => (
        <div className="max-w-[13rem] text-sm">
          <div className="truncate">{lookups.district(p.district)}</div>
          <div className="truncate text-xs text-muted-foreground">{p.address ?? "—"}</div>
        </div>
      ),
    },
    { id: "area", header: "m²", sortKey: "total_area", align: "right", hideBelow: "xl", cell: (p) => <span className="text-sm tabular">{p.total_area ?? p.built_area ?? "—"}</span> },
    { id: "rooms", header: "Dorm. / Baños / Coch.", hideBelow: "xl", cell: (p) => <span className="text-sm tabular text-muted-foreground">{p.bedrooms ?? "—"} / {p.bathrooms ?? "—"} / {p.parking}</span> },
    { id: "status", header: "Estado", cell: (p) => <PropertyStatusBadge value={p.status} /> },
    { id: "pub", header: "Publicación", hideBelow: "xl", cell: (p) => <OptBadge list={PUBLICATION_STATUSES} value={p.publication_status} /> },
    { id: "owner", header: "Propietario", hideBelow: "xl", cell: (p) => (p.owner_id ? <Link href={`/owners/${p.owner_id}`} className="block max-w-[11rem] truncate text-sm hover:text-primary">{p.owner_name}</Link> : <span className="text-muted-foreground">—</span>) },
    { id: "advisor", header: "Asesor", hideBelow: "lg", cell: (p) => <UserChip userId={p.advisor_id} /> },
    { id: "published", header: "Publicada", hideBelow: "xl", cell: (p) => <span className="text-sm text-muted-foreground tabular">{p.published_at ? fmtDate(p.published_at) : "—"}</span> },
    { id: "updated", header: "Actualizada", sortKey: "updated_at", hideBelow: "xl", cell: (p) => <span className="text-sm text-muted-foreground" suppressHydrationWarning>{fmtRelative(p.updated_at)}</span> },
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
      rowKey={(p) => p.id}
      rowHref={(p) => `/properties/${p.id}`}
      rowActions={(p) => <RowMenu p={p} />}
      empty={<EmptyBlock />}
      mobileCard={(p) => <PropertyCard p={p} />}
    />
  );
}

