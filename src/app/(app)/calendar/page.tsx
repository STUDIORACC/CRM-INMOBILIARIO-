import type { Metadata } from "next";
import { addDays, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { OpenDialogButton } from "@/components/shared/new-button";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { toInputDate, tz } from "@/lib/domain/dates";
import { isManagerRole } from "@/lib/domain/permissions";
import { calendarEvents } from "@/lib/services/calendar";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendario" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const catalogs = await getCatalogs();
  const view = sp.view === "week" || sp.view === "day" ? sp.view : "month";
  const today = toInputDate(new Date().toISOString());
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const [y, m, d] = date.split("-").map(Number);
  const base = startOfDay(tz(new Date(Date.UTC(y, m - 1, d, 12))));

  let from: Date;
  let to: Date;
  if (view === "month") {
    from = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
    to = addDays(from, 42);
  } else if (view === "week") {
    from = startOfWeek(base, { weekStartsOn: 1 });
    to = addDays(from, 7);
  } else {
    from = base;
    to = addDays(base, 1);
  }

  const canFilter = isManagerRole(session.role) || session.role === "assistant";
  const advisor = canFilter ? (sp.advisor && catalogs.users.some((u) => u.id === sp.advisor) ? sp.advisor : "") : session.id;
  const events = await withUser({ id: session.id, email: session.email }, (db) => calendarEvents(db, new Date(from.getTime()).toISOString(), new Date(to.getTime()).toISOString(), advisor || null));

  return (
    <>
      <PageHeader
        title="Calendario"
        description={canFilter ? "Visitas, tareas, seguimientos, llamadas y reuniones del equipo. Filtra por vendedor." : "Tus visitas, tareas, seguimientos, llamadas y reuniones."}
        actions={
          <>
            <OpenDialogButton kind="task" variant="outline">
              Nueva tarea
            </OpenDialogButton>
            <OpenDialogButton kind="visit">Agendar visita</OpenDialogButton>
          </>
        }
      />
      <CalendarView events={events} view={view} date={date} advisor={advisor} advisors={catalogs.users.filter((u) => u.role !== "assistant" && u.status === "active").map((u) => ({ id: u.id, name: u.fullName }))} canFilter={canFilter} today={today} />
    </>
  );
}
