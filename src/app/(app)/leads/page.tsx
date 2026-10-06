import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { AlertChips } from "@/components/shared/alert-chips";
import { ExportMenu } from "@/components/shared/export-menu";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { OpenDialogButton } from "@/components/shared/new-button";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { LEAD_STAGES, OPERATION_TYPES, PRIORITIES, TEMPERATURES } from "@/lib/domain/constants";
import { can } from "@/lib/domain/permissions";
import { LEAD_ALERT_LABELS, leadAlertCounts, type LeadAlertKey } from "@/lib/services/alerts";
import { listLeads } from "@/lib/services/leads";
import { leadListQuerySchema } from "@/lib/validation/leads";
import { LeadsTable } from "./leads-table";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const SEVERITY: Record<LeadAlertKey, "danger" | "warning" | "info"> = {
  hot_no_followup: "danger",
  overdue_follow_up: "danger",
  uncontacted: "warning",
  unassigned: "warning",
  idle: "info",
  upcoming_visit: "info",
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const catalogs = await getCatalogs();
  const query = leadListQuerySchema.parse(sp);

  const { data, alerts } = await withUser({ id: session.id, email: session.email }, async (db) => ({
    data: await listLeads(db, query),
    alerts: await leadAlertCounts(db),
  }));

  const filters: FilterDef[] = [
    { type: "search", key: "q", placeholder: "Buscar por nombre, teléfono, email o código…" },
    { type: "multi", key: "stage", label: "Etapa", options: LEAD_STAGES.map((s) => ({ value: s.value, label: s.label })) },
    { type: "multi", key: "temp", label: "Temperatura", options: TEMPERATURES.map((s) => ({ value: s.value, label: s.label })) },
    { type: "multi", key: "priority", label: "Prioridad", options: PRIORITIES.map((s) => ({ value: s.value, label: s.label })) },
    { type: "select", key: "assigned", label: "Vendedor", options: [{ value: "none", label: "Sin asignar" }, ...catalogs.users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))] },
    { type: "multi", key: "source", label: "Fuente", options: catalogs.sources.filter((s) => s.active).map((s) => ({ value: s.key, label: s.label })) },
    { type: "select", key: "district", label: "Distrito", options: catalogs.districts.filter((d) => d.active).map((d) => ({ value: d.key, label: d.label })) },
    { type: "select", key: "operation", label: "Operación", options: OPERATION_TYPES.map((o) => ({ value: o.value, label: o.label })) },
    { type: "select", key: "type", label: "Tipo", options: catalogs.propertyTypes.filter((t) => t.active).map((t) => ({ value: t.key, label: t.label })) },
    { type: "multi", key: "tag", label: "Etiqueta", options: catalogs.tags.map((t) => ({ value: t.id, label: t.name })) },
    { type: "daterange", fromKey: "from", toKey: "to", label: "Creado" },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description="Capta, califica y da seguimiento a cada oportunidad de negocio. Nada se pierde: el sistema te dice qué hacer ahora."
        actions={
          <>
            {can(session.role, "leads.export") && <ExportMenu entity="leads" />}
            {can(session.role, "leads.import") && (
              <Button variant="outline" asChild>
                <Link href="/leads/import">
                  <Upload />
                  <span className="hidden sm:inline">Importar</span>
                </Link>
              </Button>
            )}
            <OpenDialogButton kind="lead">Nuevo lead</OpenDialogButton>
          </>
        }
      />
      <AlertChips chips={(Object.keys(LEAD_ALERT_LABELS) as LeadAlertKey[]).map((k) => ({ key: k, label: LEAD_ALERT_LABELS[k], count: alerts[k], severity: SEVERITY[k] }))} />
      <FilterBar filters={filters} extraKeys={["alert"]} />
      <LeadsTable rows={data.rows} total={data.total} page={query.page} pageSize={query.pageSize} sort={query.sort} dir={query.dir} />
    </>
  );
}
