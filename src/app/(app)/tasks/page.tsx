import type { Metadata } from "next";
import { FilterBar, type FilterDef } from "@/components/shared/filter-bar";
import { OpenDialogButton } from "@/components/shared/new-button";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { PRIORITIES, TASK_KINDS } from "@/lib/domain/constants";
import { isManagerRole } from "@/lib/domain/permissions";
import { listTasks } from "@/lib/services/tasks";
import { taskListQuerySchema } from "@/lib/validation/tasks";
import { TasksView } from "./tasks-view";

export const metadata: Metadata = { title: "Tareas" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const catalogs = await getCatalogs();
  const canSeeTeam = isManagerRole(session.role) || session.role === "assistant";
  const query = taskListQuerySchema.parse(sp);
  // Un asesor solo ve lo suyo (RLS lo garantiza igualmente en la base de datos).
  query.user = canSeeTeam ? (query.user ?? "all") : session.id;
  const data = await withUser({ id: session.id, email: session.email }, (db) => listTasks(db, session, query));

  const filters: FilterDef[] = [
    { type: "search", key: "q", placeholder: "Buscar por tarea, lead o cliente…" },
    { type: "select", key: "priority", label: "Prioridad", options: PRIORITIES.map((p) => ({ value: p.value, label: p.label })) },
    { type: "select", key: "kind", label: "Tipo", options: TASK_KINDS.map((k) => ({ value: k.value, label: k.label })) },
  ];

  return (
    <>
      <PageHeader
        title="Tareas"
        description="Lo que debes hacer hoy, lo que viene y lo que se te pasó. Completa una tarea con un clic."
        actions={<OpenDialogButton kind="task">Nueva tarea</OpenDialogButton>}
      />
      <TasksView
        rows={data.rows}
        total={data.total}
        counts={data.counts}
        tab={query.tab}
        userId={data.userId}
        page={query.page}
        pageSize={query.pageSize}
        sessionId={session.id}
        team={canSeeTeam ? catalogs.users.filter((u) => u.role !== "assistant" && u.status === "active").map((u) => ({ id: u.id, name: u.fullName })) : null}
        filterBar={<FilterBar filters={filters} extraKeys={["user"]} className="mb-0 border-0 bg-transparent p-0 shadow-none" />}
      />
    </>
  );
}
