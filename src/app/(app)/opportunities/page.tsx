import type { Metadata } from "next";
import { KanbanSquare, Table2 } from "lucide-react";
import { ExportMenu } from "@/components/shared/export-menu";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { OpenDialogButton } from "@/components/shared/new-button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { NoAccess } from "@/components/shared/states";
import { ViewToggle } from "@/components/shared/view-toggle";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { PRIORITIES } from "@/lib/domain/constants";
import { formatMoneyCompact } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { listBoard, listOpportunities } from "@/lib/services/opportunities";
import { opportunityListQuerySchema } from "@/lib/validation/opportunities";
import { OpportunityBoard } from "./opportunity-board";
import { OpportunitiesTable } from "./opportunities-table";

export const metadata: Metadata = { title: "Oportunidades" };
export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  if (!can(session.role, "opportunities.access")) return <NoAccess message="Las oportunidades no están disponibles para tu rol." />;
  const catalogs = await getCatalogs();
  const query = opportunityListQuerySchema.parse(sp);
  const cur = catalogs.company.currency;
  const rate = catalogs.company.usdRate;

  const { board, table } = await withUser({ id: session.id, email: session.email }, async (db) => ({
    board: query.view === "board" ? await listBoard(db, query) : [],
    table: query.view === "table" ? await listOpportunities(db, query) : { rows: [], total: 0 },
  }));

  const rows = query.view === "board" ? board : table.rows;
  const open = rows.filter((r) => catalogs.stages.find((s) => s.key === r.stage)?.kind === "open");
  const conv = (v: number, c: string) => (c === cur ? v : c === "USD" ? v * rate : v / rate);
  const pipeline = open.reduce((a, r) => a + conv(r.value, r.currency), 0);
  const weighted = open.reduce((a, r) => a + (conv(r.value, r.currency) * r.probability) / 100, 0);

  const filters: FilterDef[] = [
    { type: "search", key: "q", placeholder: "Buscar por cliente, lead o propiedad…" },
    { type: "select", key: "advisor", label: "Vendedor", options: catalogs.users.filter((u) => u.role === "advisor" && u.status === "active").map((u) => ({ value: u.id, label: u.fullName })) },
    { type: "select", key: "priority", label: "Prioridad", options: PRIORITIES.map((p) => ({ value: p.value, label: p.label })) },
    { type: "select", key: "operation", label: "Operación", options: [{ value: "sale", label: "Venta" }, { value: "rent", label: "Alquiler" }] },
    { type: "select", key: "stalled", label: "Actividad", options: [{ value: "1", label: "Estancadas" }] },
    ...(query.view === "table" ? [{ type: "select" as const, key: "stage", label: "Etapa", options: catalogs.stages.map((s) => ({ value: s.key, label: s.label })) }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Pipeline de oportunidades"
        description="Arrastra cada oportunidad entre etapas. Cada movimiento queda registrado y actualiza propiedad, lead y métricas."
        actions={
          <>
            <ViewToggle
              param="view"
              value={query.view}
              options={[
                { value: "board", label: "Tablero", icon: <KanbanSquare className="size-4" /> },
                { value: "table", label: "Tabla", icon: <Table2 className="size-4" /> },
              ]}
            />
            {can(session.role, "opportunities.export") && <ExportMenu entity="opportunities" />}
            <OpenDialogButton kind="opportunity">Nueva oportunidad</OpenDialogButton>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Abiertas" value={open.length} hint="Oportunidades en curso" />
        <StatCard label="Valor del pipeline" value={formatMoneyCompact(pipeline, cur)} hint="Suma de abiertas" />
        <StatCard label="Pipeline ponderado" value={formatMoneyCompact(weighted, cur)} hint="Valor × probabilidad" info="Ejemplo: S/ 500,000 × 75% = S/ 375,000." />
        <StatCard label="Probabilidad media" value={open.length ? `${Math.round(open.reduce((a, r) => a + r.probability, 0) / open.length)}%` : "—"} hint="Promedio de las abiertas" />
      </div>
      <FilterBar filters={filters} extraKeys={["closed"]} />
      {query.view === "board" ? (
        <OpportunityBoard rows={board} stages={catalogs.stages} staleDays={catalogs.company.alertOpportunityDays} usdRate={rate} currency={cur} />
      ) : (
        <OpportunitiesTable rows={table.rows} total={table.total} page={query.page} pageSize={query.pageSize} sort={query.sort} dir={query.dir} />
      )}
    </>
  );
}
