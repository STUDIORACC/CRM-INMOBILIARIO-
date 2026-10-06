import type { Db } from "@/lib/db/types";
import { LEAD_STAGES, OPERATION_TYPES, PRIORITIES, PROPERTY_OPERATIONS, PROPERTY_STATUSES, PUBLICATION_STATUSES, TEMPERATURES, VISIT_OUTCOMES, VISIT_STATUSES, labelOf, type Currency } from "@/lib/domain/constants";
import { fmtDateTime } from "@/lib/domain/dates";
import { exportClients as queryClients } from "@/lib/services/clients";
import { exportLeads as queryLeads } from "@/lib/services/leads";
import { exportOpportunities as queryOpportunities } from "@/lib/services/opportunities";
import { exportProperties as queryProperties } from "@/lib/services/properties";
import type { CommercialReport, FollowupReport, PipelineReport, PropertiesReport } from "@/lib/services/reports";
import { listVisits } from "@/lib/services/visits";
import type { AdvisorStats } from "@/lib/services/team";
import type { Lookups } from "@/lib/types/catalogs";
import { clientListQuerySchema } from "@/lib/validation/clients";
import { leadListQuerySchema } from "@/lib/validation/leads";
import { opportunityListQuerySchema } from "@/lib/validation/opportunities";
import { propertyListQuerySchema } from "@/lib/validation/properties";
import { visitListQuerySchema } from "@/lib/validation/visits";
import type { ExportTable } from "./tabular";

const MAX_ROWS = 10_000;
const PAGE = 100;

type Params = Record<string, string | undefined>;

/** Recorre las páginas de un listado (respeta filtros y permisos RLS) hasta MAX_ROWS filas. */
async function collect<T>(fetchPage: (page: number) => Promise<{ rows: T[]; total: number }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; out.length < MAX_ROWS; page++) {
    const { rows, total } = await fetchPage(page);
    out.push(...rows);
    if (rows.length === 0 || out.length >= total) break;
  }
  return out.slice(0, MAX_ROWS);
}

const dt = (v: string | null | undefined) => (v ? fmtDateTime(v) : "");
const money = (v: number | null | undefined) => (v == null ? "" : Number(v));

export async function exportLeads(db: Db, sp: Params, lookups: Lookups): Promise<ExportTable[]> {
  const q = leadListQuerySchema.parse(sp);
  const rows = await queryLeads(db, q, MAX_ROWS);
  return [
    {
      sheet: "Leads",
      headers: ["Nombre", "Teléfono", "Email", "Fuente", "Etapa", "Prioridad", "Puntaje", "Temperatura", "Vendedor", "Propiedad de interés", "Operación", "Tipo buscado", "Distritos", "Presupuesto mín.", "Presupuesto máx.", "Moneda", "Motivo de pérdida", "Etiquetas", "Último contacto", "Próximo seguimiento", "Creado"],
      rows: rows.map((l) => [l.full_name, l.phone, l.email, lookups.source(l.source), labelOf(LEAD_STAGES, l.stage), labelOf(PRIORITIES, l.priority), l.score, labelOf(TEMPERATURES, l.temperature), l.assigned_to ? lookups.userName(l.assigned_to) : "Sin asignar", l.property_code ? `${l.property_code} · ${l.property_title}` : "", l.operation_type ? labelOf(OPERATION_TYPES, l.operation_type) : "", l.property_type ? lookups.propertyType(l.property_type) : "", l.districts.length ? lookups.districts(l.districts) : "", money(l.budget_min), money(l.budget_max), l.currency, l.lost_reason ? lookups.lossReason(l.lost_reason) : "", l.tags.map((t) => t.name).join(", "), dt(l.last_activity_at), dt(l.next_follow_up_at), dt(l.created_at)]),
    },
  ];
}

export async function exportClients(db: Db, sp: Params, lookups: Lookups): Promise<ExportTable[]> {
  const q = clientListQuerySchema.parse(sp);
  const rows = (await queryClients(db, q)).slice(0, MAX_ROWS);
  return [
    {
      sheet: "Clientes",
      headers: ["Nombre", "Documento", "Teléfono", "Email", "Fuente", "Vendedor", "Operación", "Tipo buscado", "Distritos", "Presupuesto mín.", "Presupuesto máx.", "Moneda", "Oportunidades abiertas", "Visitas realizadas", "Etiquetas", "Estado", "Último contacto", "Creado"],
      rows: rows.map((c) => [c.full_name, c.doc_number ? `${(c.doc_type ?? "").toUpperCase()} ${c.doc_number}`.trim() : "", c.phone, c.email, c.source ? lookups.source(c.source) : "", c.assigned_to ? lookups.userName(c.assigned_to) : "Sin asignar", c.operation_type ? labelOf(OPERATION_TYPES, c.operation_type) : "", c.property_type ? lookups.propertyType(c.property_type) : "", c.districts.length ? lookups.districts(c.districts) : "", money(c.budget_min), money(c.budget_max), c.currency, c.open_opportunities, c.visits_done, c.tags.map((t) => t.name).join(", "), c.status === "active" ? "Activo" : "Inactivo", dt(c.last_activity_at), dt(c.created_at)]),
    },
  ];
}

export async function exportProperties(db: Db, sp: Params, lookups: Lookups): Promise<ExportTable[]> {
  const q = propertyListQuerySchema.parse(sp);
  const rows = (await queryProperties(db, q)).slice(0, MAX_ROWS);
  return [
    {
      sheet: "Propiedades",
      headers: ["Código", "Título", "Tipo", "Operación", "Precio", "Moneda", "Distrito", "Dirección", "Área total (m²)", "Área construida (m²)", "Dormitorios", "Baños", "Cocheras", "Estado", "Publicación", "Propietario", "Asesor", "Consultas", "Visitas", "Oportunidades abiertas", "Publicada", "Creada"],
      rows: rows.map((p) => [p.code, p.title, lookups.propertyType(p.property_type), labelOf(PROPERTY_OPERATIONS, p.operation), Number(p.price), p.currency, lookups.district(p.district), p.address, money(p.total_area), money(p.built_area), p.bedrooms, p.bathrooms, p.parking, labelOf(PROPERTY_STATUSES, p.status), labelOf(PUBLICATION_STATUSES, p.publication_status), p.owner_name, p.advisor_id ? lookups.userName(p.advisor_id) : "", p.inquiries, p.visits, p.open_opportunities, dt(p.published_at), dt(p.created_at)]),
    },
  ];
}

export async function exportOpportunities(db: Db, sp: Params, lookups: Lookups): Promise<ExportTable[]> {
  const q = opportunityListQuerySchema.parse(sp);
  const rows = (await queryOpportunities(db, q)).slice(0, MAX_ROWS);
  return [
    {
      sheet: "Oportunidades",
      headers: ["Cliente", "Propiedad", "Distrito", "Operación", "Etapa", "Valor", "Moneda", "Probabilidad (%)", "Valor ponderado", "Prioridad", "Vendedor", "Cierre esperado", "Próximo paso", "Días sin actividad", "Motivo de pérdida", "Creada", "Cerrada"],
      rows: rows.map((o) => [o.party_name, `${o.property_code} · ${o.property_title}`, lookups.district(o.property_district), labelOf(PROPERTY_OPERATIONS, o.operation), lookups.stageLabel(o.stage), Number(o.value), o.currency, o.probability, Math.round((Number(o.value) * o.probability) / 100), labelOf(PRIORITIES, o.priority), lookups.userName(o.assigned_to), o.expected_close_date, o.next_step, o.days_idle, o.lost_reason ? lookups.lossReason(o.lost_reason) : "", dt(o.created_at), dt(o.won_at ?? o.lost_at)]),
    },
  ];
}

export async function exportVisits(db: Db, sp: Params, lookups: Lookups, advisorScope: string | null): Promise<ExportTable[]> {
  const q = visitListQuerySchema.parse(sp);
  const rows = await collect((page) => listVisits(db, { ...q, page, pageSize: PAGE }, advisorScope));
  return [
    {
      sheet: "Visitas",
      headers: ["Fecha y hora", "Duración (min)", "Cliente / lead", "Teléfono", "Propiedad", "Distrito", "Dirección", "Asesor", "Estado", "Resultado", "Observaciones", "Motivo de cancelación"],
      rows: rows.map((v) => [dt(v.scheduled_at), v.duration_min, v.party_name, v.party_phone, `${v.property_code} · ${v.property_title}`, lookups.district(v.property_district), v.property_address, lookups.userName(v.advisor_id), labelOf(VISIT_STATUSES, v.status), v.outcome ? labelOf(VISIT_OUTCOMES, v.outcome) : "", v.advisor_notes ?? v.observations, v.cancel_reason]),
    },
  ];
}

// --- Reportes ---------------------------------------------------------------------------
export function commercialTables(d: CommercialReport, lookups: Lookups, cur: Currency): ExportTable[] {
  const k = d.kpis;
  return [
    {
      sheet: "Resumen",
      headers: ["Indicador", "Valor"],
      rows: [
        ["Leads nuevos", k.leads],
        ["Leads del periodo anterior", k.leadsPrev],
        ["Oportunidades creadas", k.oppsCreated],
        ["Operaciones cerradas", k.won],
        [`Valor cerrado (${cur})`, Math.round(k.wonValue)],
        [`Ticket promedio (${cur})`, Math.round(k.avgTicket)],
        ["Conversión (%)", Number(k.conversion.toFixed(2))],
        ["Tiempo de cierre (días)", k.avgCloseDays == null ? "" : Number(k.avgCloseDays.toFixed(1))],
        ["Oportunidades perdidas", k.lost],
      ],
    },
    { sheet: "Evolución", headers: ["Periodo", "Leads", "Cierres", `Valor cerrado (${cur})`], rows: d.series.map((s) => [s.label, s.leads, s.won, Math.round(s.wonValue)]) },
    { sheet: "Fuentes", headers: ["Fuente", "Leads", "Cierres", "Conversión (%)", `Valor cerrado (${cur})`], rows: d.sources.map((s) => [lookups.source(s.key), s.leads, s.won, Number(s.conversion.toFixed(2)), Math.round(s.wonValue)]) },
    { sheet: "Motivos de pérdida", headers: ["Motivo", "Oportunidades", "Leads"], rows: d.lossReasons.map((l) => [lookups.lossReason(l.key), l.opportunities, l.leads]) },
    { sheet: "Por tipo", headers: ["Tipo de propiedad", "Cierres", `Valor (${cur})`], rows: d.byType.map((t) => [lookups.propertyType(t.key), t.count, Math.round(t.value)]) },
    { sheet: "Por distrito", headers: ["Distrito", "Cierres", `Valor (${cur})`], rows: d.byDistrict.map((t) => [lookups.district(t.key), t.count, Math.round(t.value)]) },
  ];
}

export function teamTables(rows: AdvisorStats[], cur: Currency): ExportTable[] {
  return [
    {
      sheet: "Vendedores",
      headers: ["Vendedor", "Leads nuevos", "% contactados", "Resp. promedio (h)", "Leads activos", "Visitas realizadas", "Oportunidades abiertas", `Pipeline (${cur})`, `Ponderado (${cur})`, "Cierres", `Valor cerrado (${cur})`, "Conversión (%)", "Tareas vencidas", "Tareas completadas", "Actividades"],
      rows: rows.map((a) => [a.full_name, a.new_leads, Number(a.contact_rate.toFixed(1)), a.avg_response_hours == null ? "" : Number(a.avg_response_hours.toFixed(1)), a.active_leads, a.visits_done, a.open_opps, Math.round(a.open_value), Math.round(a.weighted_value), a.won_count, Math.round(a.won_value), Number(a.conversion.toFixed(2)), a.tasks_overdue, a.tasks_done, a.activities]),
    },
  ];
}

export function pipelineTables(d: PipelineReport, lookups: Lookups, cur: Currency): ExportTable[] {
  return [
    { sheet: "Por etapa", headers: ["Etapa", "Oportunidades", `Valor (${cur})`, `Ponderado (${cur})`], rows: d.byStage.map((s) => [lookups.stageLabel(s.stage), s.count, Math.round(s.value), Math.round(s.weighted)]) },
    { sheet: "Tiempo por etapa", headers: ["Etapa", "Días promedio", "Movimientos"], rows: d.timeInStage.map((s) => [lookups.stageLabel(s.stage), Number(s.avgDays.toFixed(1)), s.samples]) },
    { sheet: "Antigüedad", headers: ["Antigüedad en etapa", "Oportunidades", `Valor (${cur})`], rows: d.aging.map((s) => [s.bucket, s.count, Math.round(s.value)]) },
    { sheet: "Proyección", headers: ["Mes de cierre esperado", "Oportunidades", `Valor (${cur})`, `Ponderado (${cur})`], rows: d.forecast.map((s) => [s.label, s.count, Math.round(s.value), Math.round(s.weighted)]) },
    { sheet: "Mayores oportunidades", headers: ["Cliente", "Propiedad", "Etapa", "Vendedor", `Valor (${cur})`, "Prob. (%)", `Ponderado (${cur})`, "Días en etapa"], rows: d.top.map((o) => [o.party, o.property_code, lookups.stageLabel(o.stage), lookups.userName(o.assigned_to), Math.round(o.value), o.probability, Math.round(o.weighted), o.days_in_stage]) },
  ];
}

export function propertiesTables(d: PropertiesReport, lookups: Lookups, cur: Currency): ExportTable[] {
  return [
    { sheet: "Por estado", headers: ["Estado", "Propiedades"], rows: d.byStatus.map((s) => [labelOf(PROPERTY_STATUSES, s.key), s.count]) },
    { sheet: "Por distrito", headers: ["Distrito", "Propiedades", `Precio promedio (${cur})`], rows: d.byDistrict.map((s) => [lookups.district(s.key), s.count, Math.round(s.avgPrice)]) },
    { sheet: "Por tipo", headers: ["Tipo", "Propiedades"], rows: d.byType.map((s) => [lookups.propertyType(s.key), s.count]) },
    { sheet: "Más consultadas", headers: ["Propiedad", "Consultas"], rows: d.topInquired.map((p) => [`${p.code} · ${p.title}`, p.count]) },
    { sheet: "Más visitadas", headers: ["Propiedad", "Visitas"], rows: d.topVisited.map((p) => [`${p.code} · ${p.title}`, p.count]) },
    { sheet: "Estancadas", headers: ["Propiedad", "Distrito", "Asesor", "Precio", "Moneda", "Días publicada"], rows: d.stale.map((p) => [`${p.code} · ${p.title}`, lookups.district(p.district), p.advisor_id ? lookups.userName(p.advisor_id) : "", p.price, p.currency, p.days]) },
  ];
}

export function followupTables(d: FollowupReport): ExportTable[] {
  return [
    {
      sheet: "Resumen",
      headers: ["Indicador", "Valor"],
      rows: [
        ["Primera respuesta promedio (h)", d.firstResponse.avgHours == null ? "" : Number(d.firstResponse.avgHours.toFixed(1))],
        [`Leads respondidos dentro de ${d.firstResponse.targetHours} h`, d.firstResponse.withinTarget],
        ["Leads del periodo", d.firstResponse.total],
        ["Oportunidades detenidas", d.stalledOpps],
        ["Visitas programadas en el periodo", d.visits.total],
        ["Visitas realizadas", d.visits.completed],
        ["Visitas canceladas", d.visits.cancelled],
        ["Visitas sin asistencia", d.visits.noShow],
      ],
    },
    { sheet: "Tareas", headers: ["Responsable", "Completadas", "Vencidas", "Pendientes", "Cumplimiento (%)"], rows: d.tasks.map((t) => [t.name, t.done, t.overdue, t.open, Number(t.rate.toFixed(1))]) },
  ];
}
