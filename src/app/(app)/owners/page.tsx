import type { Metadata } from "next";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { OpenDialogButton } from "@/components/shared/new-button";
import { PageHeader } from "@/components/shared/page-header";
import { NoAccess } from "@/components/shared/states";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { OWNER_TYPES } from "@/lib/domain/constants";
import { can } from "@/lib/domain/permissions";
import { listOwners } from "@/lib/services/owners";
import { ownerListQuerySchema } from "@/lib/validation/clients";
import { OwnersTable } from "./owners-table";

export const metadata: Metadata = { title: "Propietarios" };
export const dynamic = "force-dynamic";

export default async function OwnersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  if (!can(session.role, "owners.access")) return <NoAccess message="Los propietarios no están disponibles para tu rol." />;
  const query = ownerListQuerySchema.parse(sp);
  const data = await withUser({ id: session.id, email: session.email }, (db) => listOwners(db, query));
  const filters: FilterDef[] = [
    { type: "search", key: "q", placeholder: "Buscar por nombre, DNI/RUC, teléfono o email…" },
    { type: "select", key: "type", label: "Tipo", options: OWNER_TYPES.map((o) => ({ value: o.value, label: o.label })) },
  ];
  return (
    <>
      <PageHeader title="Propietarios" description="Dueños de los inmuebles en cartera, con sus propiedades, visitas y operaciones." actions={<OpenDialogButton kind="owner">Nuevo propietario</OpenDialogButton>} />
      <FilterBar filters={filters} />
      <OwnersTable rows={data.rows} total={data.total} page={query.page} pageSize={query.pageSize} sort={query.sort} dir={query.dir} />
    </>
  );
}
