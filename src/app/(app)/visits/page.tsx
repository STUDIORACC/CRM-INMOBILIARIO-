import type { Metadata } from "next";
import { List, Rows3 } from "lucide-react";
import { AlertChips } from "@/components/shared/alert-chips";
import { ExportMenu } from "@/components/shared/export-menu";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { OpenDialogButton } from "@/components/shared/new-button";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { VISIT_STATUSES } from "@/lib/domain/constants";
import { can } from "@/lib/domain/permissions";
import { listVisits, visitChipCounts } from "@/lib/services/visits";
import { visitListQuerySchema } from "@/lib/validation/visits";
import { VisitsAgenda, VisitsTable } from "./visits-view";
import { PaginationBar } from "@/components/shared/pagination-bar";

export const metadata: Metadata = { title: "Visitas" };
export const dynamic = "force-dynamic";

export default async function VisitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const catalogs = await getCatalogs();
  const query = visitListQuerySchema.parse(sp);
  const { data, counts } = await withUser({ id: session.id, email: session.email }, async (db) => ({ data: await listVisits(db, query), counts: await visitChipCounts(db) }));

  const filters: FilterDef[] = [
    { type: "search", key: "q", placeholder: "Buscar por cliente, lead o propiedad…" },
    {
      type: "select",
      key: "range",
      label: "Periodo",
      options: [
        { value: "today", label: "Hoy" },
        { value: "tomorrow", label: "Mañana" },
        { value: "week", label: "Próximos 7 días" },
        { value: "upcoming", label: "Hoy en adelante" },
        { value: "past", label: "Pasadas" },
        { value: "all", label: "Todas" },
      ],
    },
    { type: "multi", key: "status", label: "Estado", options: VISIT_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { type: "select", key: "advisor", label: "Asesor", options: catalogs.users.filter((u) => u.role !== "assistant" && u.status === "active").map((u) => ({ value: u.id, label: u.fullName })) },
    { type: "daterange", fromKey: "from", toKey: "to", label: "Fechas" },
  ];

  return (
    <>
      <PageHeader
        title="Visitas"
        description="Agenda de visitas a propiedades. Después de cada visita registra el resultado: es lo que mueve el negocio."
        actions={
          <>
            <ViewToggle param="view" value={query.view} options={[{ value: "agenda", label: "Agenda", icon: <Rows3 className="size-4" /> }, { value: "table", label: "Tabla", icon: <List className="size-4" /> }]} />
            {can(session.role, "visits.export") && <ExportMenu entity="visits" />}
            <OpenDialogButton kind="visit">Agendar visita</OpenDialogButton>
          </>
        }
      />
      <AlertChips
        param="pending"
        chips={[{ key: "1", label: "Sin resultado registrado", count: counts.pending, severity: "danger" }]}
      />
      {counts.tomorrowUnconfirmed > 0 && (
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">
          {counts.tomorrowUnconfirmed} visita{counts.tomorrowUnconfirmed === 1 ? "" : "s"} de mañana pendiente{counts.tomorrowUnconfirmed === 1 ? "" : "s"} de confirmar · {counts.today} visita{counts.today === 1 ? "" : "s"} hoy
        </p>
      )}
      <FilterBar filters={filters} extraKeys={["pending"]} />
      {query.view === "table" ? (
        <VisitsTable rows={data.rows} total={data.total} page={query.page} pageSize={query.pageSize} />
      ) : (
        <div className="space-y-4">
          <VisitsAgenda rows={data.rows} />
          {data.total > query.pageSize && <PaginationBar page={query.page} pageSize={query.pageSize} total={data.total} />}
        </div>
      )}
    </>
  );
}
