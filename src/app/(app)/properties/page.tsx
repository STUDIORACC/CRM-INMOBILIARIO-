import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Plus, Table2 } from "lucide-react";
import { AlertChips } from "@/components/shared/alert-chips";
import { ExportMenu } from "@/components/shared/export-menu";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { PROPERTY_STATUSES, PUBLICATION_STATUSES } from "@/lib/domain/constants";
import { can } from "@/lib/domain/permissions";
import { listProperties, quietPropertiesCount } from "@/lib/services/properties";
import { propertyListQuerySchema } from "@/lib/validation/properties";
import { PropertiesGrid, PropertiesTable } from "./properties-view";

export const metadata: Metadata = { title: "Propiedades" };
export const dynamic = "force-dynamic";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const catalogs = await getCatalogs();
  const query = propertyListQuerySchema.parse(sp);
  const { data, quiet } = await withUser({ id: session.id, email: session.email }, async (db) => ({ data: await listProperties(db, query), quiet: await quietPropertiesCount(db) }));

  const filters: FilterDef[] = [
    { type: "search", key: "q", placeholder: "Buscar por código, título, dirección o propietario…" },
    { type: "multi", key: "status", label: "Estado", options: PROPERTY_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { type: "multi", key: "publication", label: "Publicación", options: PUBLICATION_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { type: "select", key: "operation", label: "Operación", options: [{ value: "sale", label: "Venta" }, { value: "rent", label: "Alquiler" }] },
    { type: "select", key: "type", label: "Tipo", options: catalogs.propertyTypes.filter((t) => t.active).map((t) => ({ value: t.key, label: t.label })) },
    { type: "select", key: "district", label: "Distrito", options: catalogs.districts.filter((d) => d.active).map((d) => ({ value: d.key, label: d.label })) },
    { type: "select", key: "advisor", label: "Asesor", options: catalogs.users.filter((u) => u.role !== "assistant" && u.status === "active").map((u) => ({ value: u.id, label: u.fullName })) },
    { type: "numrange", minKey: "priceMin", maxKey: "priceMax", label: "Precio" },
    { type: "select", key: "bedrooms", label: "Dormitorios", options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}+` })) },
  ];

  return (
    <>
      <PageHeader
        title="Propiedades"
        description="Inventario completo con estado comercial, publicación, propietario y asesor responsable."
        actions={
          <>
            <ViewToggle param="view" value={query.view} options={[{ value: "grid", label: "Galería", icon: <LayoutGrid className="size-4" /> }, { value: "table", label: "Tabla", icon: <Table2 className="size-4" /> }]} />
            {can(session.role, "properties.export") && <ExportMenu entity="properties" />}
            {can(session.role, "properties.create") && (
              <Button asChild>
                <Link href="/properties/new">
                  <Plus /> Nueva propiedad
                </Link>
              </Button>
            )}
          </>
        }
      />
      <AlertChips chips={[{ key: "1", label: "Sin movimiento (30 días)", count: quiet, severity: "warning" }]} param="quiet" />
      <FilterBar filters={filters} extraKeys={["quiet"]} />
      {query.view === "table" ? (
        <PropertiesTable rows={data.rows} total={data.total} page={query.page} pageSize={query.pageSize} sort={query.sort} dir={query.dir} />
      ) : (
        <PropertiesGrid rows={data.rows} total={data.total} page={query.page} pageSize={query.pageSize} />
      )}
    </>
  );
}
