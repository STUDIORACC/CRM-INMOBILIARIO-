import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCatalogs, getLookups } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { isPeriodKey, resolvePeriod, type PeriodKey } from "@/lib/domain/dates";
import { can, type Capability } from "@/lib/domain/permissions";
import { commercialTables, exportClients, exportLeads, exportOpportunities, exportProperties, exportVisits, followupTables, pipelineTables, propertiesTables, teamTables } from "@/lib/export/builders";
import { toCsv, toXlsx, type ExportTable } from "@/lib/export/tabular";
import { getCommercialReport, getFollowupReport, getPipelineReport, getPropertiesReport, type ReportParams } from "@/lib/services/reports";
import { getTeamStats } from "@/lib/services/team";

export const dynamic = "force-dynamic";

const CAPABILITY: Record<string, Capability> = {
  leads: "leads.export",
  clients: "clients.export",
  properties: "properties.export",
  opportunities: "opportunities.export",
  visits: "visits.export",
  report: "reports.view",
};

const FILE_LABEL: Record<string, string> = { leads: "leads", clients: "clientes", properties: "propiedades", opportunities: "oportunidades", visits: "visitas" };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries()) as Record<string, string | undefined>;
  const entity = sp.entity ?? "";
  const format = sp.format === "xlsx" ? "xlsx" : "csv";
  const capability = CAPABILITY[entity];
  if (!capability) return NextResponse.json({ error: "Tipo de exportación no válido" }, { status: 400 });
  if (!can(session.role, capability)) return NextResponse.json({ error: "No tienes permiso para exportar esta información" }, { status: 403 });

  const [catalogs, lookups] = await Promise.all([getCatalogs(), getLookups()]);
  const actor = { id: session.id, email: session.email };
  const cur = catalogs.company.currency;

  let tables: ExportTable[];
  let name = FILE_LABEL[entity] ?? "reporte";
  try {
    tables = await withUser(actor, async (db) => {
      switch (entity) {
        case "leads":
          return exportLeads(db, sp, lookups);
        case "clients":
          return exportClients(db, sp, lookups);
        case "properties":
          return exportProperties(db, sp, lookups);
        case "opportunities":
          return exportOpportunities(db, sp, lookups);
        case "visits":
          return exportVisits(db, sp, lookups, session.role === "advisor" ? session.id : null);
        default: {
          const global = can(session.role, "reports.global");
          const periodKey: PeriodKey = isPeriodKey(sp.period) ? sp.period : "30d";
          const period = resolvePeriod(periodKey, { from: sp.from, to: sp.to });
          const advisor = global && sp.advisor && catalogs.users.some((u) => u.id === sp.advisor) ? sp.advisor : null;
          const params: ReportParams = { period, ownerId: global ? advisor : session.id, currency: cur, usdRate: catalogs.company.usdRate };
          name = `reporte-${sp.type ?? "comercial"}`;
          switch (sp.type) {
            case "team":
              if (!global) throw new Response("forbidden", { status: 403 });
              return teamTables((await getTeamStats(db, period, cur, params.usdRate)).filter((s) => s.role === "advisor" && s.status === "active"), cur);
            case "pipeline":
              return pipelineTables(await getPipelineReport(db, params), lookups, cur);
            case "properties":
              return propertiesTables(await getPropertiesReport(db, params), lookups, cur);
            case "followup":
              return followupTables(await getFollowupReport(db, params));
            default:
              return commercialTables(await getCommercialReport(db, params), lookups, cur);
          }
        }
      }
    });
  } catch (err) {
    if (err instanceof Response) return NextResponse.json({ error: "No tienes permiso para exportar esta información" }, { status: 403 });
    console.error("[export] error:", err);
    return NextResponse.json({ error: "No se pudo generar el archivo. Revisa los filtros e inténtalo de nuevo." }, { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${name}-${stamp}.${format}`;
  const headers = { "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" };
  if (format === "xlsx") {
    const buf = await toXlsx(tables);
    return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  }
  return new NextResponse(toCsv(tables), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
}
