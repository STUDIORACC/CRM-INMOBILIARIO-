import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ClipboardCheck, Home, Layers, Trophy } from "lucide-react";
import { ExportMenu } from "@/components/shared/export-menu";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodFilter } from "@/components/shared/period-filter";
import { NoAccess } from "@/components/shared/states";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs, getLookups } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { isPeriodKey, resolvePeriod, type PeriodKey } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import { getCommercialReport, getFollowupReport, getPipelineReport, getPropertiesReport, type ReportParams } from "@/lib/services/reports";
import { getTeamStats } from "@/lib/services/team";
import { cn } from "@/lib/utils";
import { AdvisorSelect } from "../dashboard/advisor-select";
import { CommercialSection, FollowupSection, PipelineSection, PropertiesSection, TeamSection } from "./sections";

export const metadata: Metadata = { title: "Reportes" };
export const dynamic = "force-dynamic";

const PERIODS: PeriodKey[] = ["today", "week", "month", "last_month", "30d", "90d", "custom"];

const TABS = [
  { key: "commercial", label: "Comercial", icon: BarChart3 },
  { key: "team", label: "Vendedores", icon: Trophy, global: true },
  { key: "pipeline", label: "Pipeline", icon: Layers },
  { key: "properties", label: "Propiedades", icon: Home },
  { key: "followup", label: "Seguimiento", icon: ClipboardCheck },
] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  if (!can(session.role, "reports.view")) return <NoAccess />;
  const [catalogs, lookups] = await Promise.all([getCatalogs(), getLookups()]);
  const global = can(session.role, "reports.global");
  const tabs = TABS.filter((t) => !("global" in t) || global);
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? "commercial";

  const periodKey: PeriodKey = isPeriodKey(sp.period) ? sp.period : "30d";
  const period = resolvePeriod(periodKey, { from: sp.from, to: sp.to });
  const advisorFilter = global && sp.advisor && catalogs.users.some((u) => u.id === sp.advisor) ? sp.advisor : null;
  const ownerId = global ? advisorFilter : session.id;
  const params: ReportParams = { period, ownerId, currency: catalogs.company.currency, usdRate: catalogs.company.usdRate };
  const cur = catalogs.company.currency;
  const actor = { id: session.id, email: session.email };

  const content = await withUser(actor, async (db) => {
    switch (tab) {
      case "team":
        return <TeamSection stats={(await getTeamStats(db, period, cur, params.usdRate)).filter((s) => s.role === "advisor" && s.status === "active")} cur={cur} />;
      case "pipeline":
        return <PipelineSection data={await getPipelineReport(db, params)} cur={cur} lookups={lookups} stages={catalogs.stages} />;
      case "properties":
        return <PropertiesSection data={await getPropertiesReport(db, params)} cur={cur} lookups={lookups} />;
      case "followup":
        return <FollowupSection data={await getFollowupReport(db, params)} />;
      default:
        return <CommercialSection data={await getCommercialReport(db, params)} cur={cur} lookups={lookups} />;
    }
  });

  const advisors = catalogs.users.filter((u) => u.role === "advisor" && u.status === "active");
  const exportable = can(session.role, "leads.export") || can(session.role, "reports.global");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reportes"
        description={`${ownerId ? (ownerId === session.id ? "Tu trabajo" : lookups.userName(ownerId)) : "Toda la inmobiliaria"} · ${period.label.toLowerCase()}. Los números salen de los datos reales del CRM y se pueden exportar.`}
        actions={
          <>
            {global && advisors.length > 0 && tab !== "team" && <AdvisorSelect advisors={advisors.map((a) => ({ id: a.id, name: a.fullName }))} value={advisorFilter ?? ""} />}
            {exportable && <ExportMenu entity="report" extra={{ type: tab }} />}
            <PeriodFilter options={PERIODS} value={period.key} from={period.fromDate} to={period.toDate} />
          </>
        }
      />
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Tipo de reporte">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          const q = new URLSearchParams();
          for (const [k, v] of Object.entries(sp)) if (v && k !== "tab") q.set(k, v);
          if (t.key !== "commercial") q.set("tab", t.key);
          return (
            <Link key={t.key} href={q.size ? `/reports?${q}` : "/reports"} role="tab" aria-selected={on} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>
              <Icon className="size-3.5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      {content}
    </div>
  );
}
