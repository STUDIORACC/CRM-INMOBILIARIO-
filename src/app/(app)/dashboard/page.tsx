import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodFilter } from "@/components/shared/period-filter";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs, getLookups } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { isPeriodKey, resolvePeriod, tz, type PeriodKey } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import { getDashboard } from "@/lib/services/dashboard";
import { AdvisorSelect } from "./advisor-select";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const PERIODS: PeriodKey[] = ["today", "week", "month", "30d", "90d", "custom"];

function greeting(): string {
  const h = tz().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const [catalogs, lookups] = await Promise.all([getCatalogs(), getLookups()]);
  const global = can(session.role, "dashboard.global");

  const periodKey: PeriodKey = isPeriodKey(sp.period) ? sp.period : "30d";
  const period = resolvePeriod(periodKey, { from: sp.from, to: sp.to });
  // Asesores y asistentes ven solo lo suyo; la gerencia puede filtrar por vendedor
  const advisorFilter = global && sp.advisor && catalogs.users.some((u) => u.id === sp.advisor) ? sp.advisor : null;
  const ownerId = global ? advisorFilter : session.id;

  const data = await withUser({ id: session.id, email: session.email }, (db) =>
    getDashboard(db, { period, ownerId, viewerId: session.id, currency: catalogs.company.currency, usdRate: catalogs.company.usdRate }),
  );
  const cur = catalogs.company.currency;
  const advisors = catalogs.users.filter((u) => u.role === "advisor" && u.status === "active");

  const scopeLabel = ownerId ? (ownerId === session.id ? "Tu trabajo" : lookups.userName(ownerId)) : "Toda la inmobiliaria";

  return (
    <div className="space-y-6">
      <PageHeader
        title={global ? "Dashboard" : "Mi dashboard"}
        description={`${greeting()}, ${session.fullName.split(" ")[0]}. ${scopeLabel} · ${period.label.toLowerCase()}.`}
        actions={
          <>
            {global && advisors.length > 0 && <AdvisorSelect advisors={advisors.map((a) => ({ id: a.id, name: a.fullName }))} value={advisorFilter ?? ""} />}
            <PeriodFilter options={PERIODS} value={period.key} from={period.fromDate} to={period.toDate} />
          </>
        }
      />

      <DashboardView data={data} period={period} cur={cur} global={global} ownerId={ownerId} lookups={lookups} />
    </div>
  );
}
