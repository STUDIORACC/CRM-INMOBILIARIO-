import type { Metadata } from "next";
import { ExportMenu } from "@/components/shared/export-menu";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { OpenDialogButton } from "@/components/shared/new-button";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { OPERATION_TYPES } from "@/lib/domain/constants";
import { can } from "@/lib/domain/permissions";
import { listClients } from "@/lib/services/clients";
import { clientListQuerySchema } from "@/lib/validation/clients";
import { ClientsTable } from "./clients-table";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const catalogs = await getCatalogs();
  const query = clientListQuerySchema.parse(sp);
  const data = await withUser({ id: session.id, email: session.email }, (db) => listClients(db, query));

  const filters: FilterDef[] = [
    { type: "search", key: "q", placeholder: "Buscar por nombre, teléfono, email o documento…" },
    { type: "select", key: "assigned", label: "Asesor", options: [{ value: "none", label: "Sin asignar" }, ...catalogs.users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))] },
    { type: "select", key: "operation", label: "Busca", options: OPERATION_TYPES.map((o) => ({ value: o.value, label: o.label })) },
    { type: "select", key: "district", label: "Distrito", options: catalogs.districts.filter((d) => d.active).map((d) => ({ value: d.key, label: d.label })) },
    { type: "multi", key: "tag", label: "Etiqueta", options: catalogs.tags.map((t) => ({ value: t.id, label: t.name })) },
    { type: "select", key: "idle", label: "Actividad", options: [{ value: "1", label: "Sin actividad reciente" }] },
    { type: "daterange", fromKey: "from", toKey: "to", label: "Alta" },
  ];

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Personas que ya compran, alquilan o están en búsqueda activa. Cada ficha concentra preferencias, visitas, oportunidades e historial."
        actions={
          <>
            {can(session.role, "clients.export") && <ExportMenu entity="clients" />}
            <OpenDialogButton kind="client">Nuevo cliente</OpenDialogButton>
          </>
        }
      />
      <FilterBar filters={filters} />
      <ClientsTable rows={data.rows} total={data.total} page={query.page} pageSize={query.pageSize} sort={query.sort} dir={query.dir} />
    </>
  );
}
