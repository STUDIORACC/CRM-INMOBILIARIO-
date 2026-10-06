import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { NoAccess } from "@/components/shared/states";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { can } from "@/lib/domain/permissions";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importar leads" };
export const dynamic = "force-dynamic";

export default async function ImportLeadsPage() {
  const session = await requireSession();
  if (!can(session.role, "leads.import")) return <NoAccess />;
  const catalogs = await getCatalogs();
  return (
    <>
      <PageHeader
        title="Importar leads"
        description="Sube un archivo CSV o Excel, relaciona las columnas, revisa los duplicados y confirma. Nada se guarda hasta el último paso."
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "Importar" }]}
      />
      <ImportWizard
        sources={catalogs.sources.filter((s) => s.active).map((s) => ({ value: s.key, label: s.label }))}
        advisors={catalogs.users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))}
        ownOnly={session.role === "advisor"}
      />
    </>
  );
}
