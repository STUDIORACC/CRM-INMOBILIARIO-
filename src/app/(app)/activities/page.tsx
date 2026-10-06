import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { OpenDialogButton } from "@/components/shared/new-button";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { ActivityTimeline } from "@/components/shared/timeline";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { ACTIVITY_TYPES, AUDIT_ENTITIES, AUDIT_EVENTS } from "@/lib/domain/constants";
import { addDaysIso, startOfDayIso } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import { listAudit } from "@/lib/services/audit";
import { listTimeline } from "@/lib/services/timeline";
import { activityFeedQuerySchema, auditQuerySchema } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: "Actividades" };
export const dynamic = "force-dynamic";

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const catalogs = await getCatalogs();
  const canAudit = can(session.role, "audit.view");
  const query = activityFeedQuerySchema.parse(sp);
  const tab = query.tab === "audit" && canAudit ? "audit" : "activity";
  const actor = { id: session.id, email: session.email };
  const users = catalogs.users.filter((u) => u.status === "active").map((u) => ({ value: u.id, label: u.fullName }));

  const tabs = (
    <div className="mb-4 flex gap-1" role="tablist" aria-label="Sección">
      {[
        { key: "activity", label: "Actividad comercial", href: "/activities" },
        ...(canAudit ? [{ key: "audit", label: "Auditoría", href: "/activities?tab=audit" }] : []),
      ].map((t) => (
        <Link key={t.key} href={t.href} role="tab" aria-selected={tab === t.key} className={cn("rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (tab === "audit") {
    const aq = auditQuerySchema.parse(sp);
    const { rows, total } = await withUser(actor, (db) => listAudit(db, aq));
    const filters: FilterDef[] = [
      { type: "search", key: "q", placeholder: "Buscar por registro o usuario…" },
      { type: "select", key: "entity", label: "Módulo", options: AUDIT_ENTITIES.map((e) => ({ value: e.value, label: e.label })) },
      { type: "select", key: "event", label: "Evento", options: AUDIT_EVENTS.map((e) => ({ value: e.value, label: e.label })) },
      { type: "select", key: "user", label: "Usuario", options: users },
      { type: "daterange", fromKey: "from", toKey: "to", label: "Fechas" },
    ];
    return (
      <>
        <PageHeader title="Actividades" description="Auditoría: quién cambió qué y cuándo. Los registros no se pueden editar ni eliminar." />
        {tabs}
        <FilterBar filters={filters} extraKeys={["tab"]} />
        <AuditView rows={rows} />
        {total > aq.pageSize && <div className="mt-4"><PaginationBar page={aq.page} pageSize={aq.pageSize} total={total} /></div>}
      </>
    );
  }

  const from = query.from ? startOfDayIso(query.from) : undefined;
  const to = query.to ? startOfDayIso(query.to) : undefined;
  const { items, total } = await withUser(actor, (db) =>
    listTimeline(db, {
      q: query.q,
      types: query.type.length ? query.type : undefined,
      userId: query.user,
      from: from ?? undefined,
      to: to ? addDaysIso(to, 1) : undefined,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  );
  const filters: FilterDef[] = [
    { type: "search", key: "q", placeholder: "Buscar en actividades, notas, leads o clientes…" },
    { type: "multi", key: "type", label: "Tipo", options: ACTIVITY_TYPES.filter((t) => t.value !== "email").map((t) => ({ value: t.value, label: t.label })) },
    { type: "select", key: "user", label: "Responsable", options: users },
    { type: "daterange", fromKey: "from", toKey: "to", label: "Fechas" },
  ];

  return (
    <>
      <PageHeader
        title="Actividades"
        description={`Todo lo que pasa en la operación: llamadas, WhatsApp, visitas, notas y eventos del sistema. ${total.toLocaleString("es-PE")} registros.`}
        actions={<OpenDialogButton kind="activity">Registrar actividad</OpenDialogButton>}
      />
      {tabs}
      <FilterBar filters={filters} extraKeys={["tab"]} />
      <ActivityTimeline items={items} allowNotes={false} showParty title="Actividad del equipo" />
      {total > query.pageSize && (
        <div className="mt-4">
          <PaginationBar page={query.page} pageSize={query.pageSize} total={total} />
        </div>
      )}
    </>
  );
}
