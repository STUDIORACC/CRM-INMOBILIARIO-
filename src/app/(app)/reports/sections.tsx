import Link from "next/link";
import { AlertTriangle, BadgeDollarSign, CalendarCheck, Clock, Handshake, Home, Layers, Percent, Target, Timer, TrendingDown, Trophy, UserPlus, Wallet } from "lucide-react";
import { RankingCard } from "@/components/charts/bars";
import { AreaTrend, ColumnsChart } from "@/components/charts/columns-chart";
import { Panel } from "@/components/shared/panel";
import { StatCard, pctChange } from "@/components/shared/stat-card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { PROPERTY_OPERATIONS, PROPERTY_STATUSES, VISIT_OUTCOMES, labelOf, type Currency } from "@/lib/domain/constants";
import { formatMoney, formatMoneyCompact, formatNumber, formatPercent } from "@/lib/domain/money";
import { SERIES } from "@/lib/domain/viz";
import type { CommercialReport, FollowupReport, PipelineReport, PropertiesReport } from "@/lib/services/reports";
import type { AdvisorStats } from "@/lib/services/team";
import type { Lookups, StageDef } from "@/lib/types/catalogs";
import { LEAD_ALERT_LABELS } from "@/lib/services/alerts";
import { cn } from "@/lib/utils";

const days = (n: number | null) => (n == null ? "—" : `${n.toFixed(n < 10 ? 1 : 0)} días`);

/** Tabla simple para listados de reportes (el detalle navegable vive en cada módulo). */
function Table({ headers, rows, empty = "Sin datos en el periodo" }: { headers: Array<{ label: string; right?: boolean }>; rows: React.ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {headers.map((h) => (
              <th key={h.label} className={cn("px-2 py-2 font-medium whitespace-nowrap", h.right ? "text-right" : "text-left")}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cn("px-2 py-2", headers[j]?.right && "text-right tabular")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
export function CommercialSection({ data, cur, lookups }: { data: CommercialReport; cur: Currency; lookups: Lookups }) {
  const k = data.kpis;
  const chartData = data.series.map((s) => ({ label: s.label, leads: s.leads, won: s.won, wonValue: s.wonValue }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Leads nuevos" value={formatNumber(k.leads)} icon={<UserPlus className="size-4" />} delta={{ value: pctChange(k.leads, k.leadsPrev) }} href="/leads" />
        <StatCard label="Oportunidades creadas" value={formatNumber(k.oppsCreated)} icon={<Target className="size-4" />} accent="text-violet-600 bg-violet-50" href="/opportunities" />
        <StatCard label="Operaciones cerradas" value={formatNumber(k.won)} icon={<Trophy className="size-4" />} delta={{ value: pctChange(k.won, k.wonPrev) }} accent="text-emerald-600 bg-emerald-50" />
        <StatCard label="Valor cerrado" value={formatMoneyCompact(k.wonValue, cur)} icon={<BadgeDollarSign className="size-4" />} delta={{ value: pctChange(k.wonValue, k.wonValuePrev) }} accent="text-emerald-600 bg-emerald-50" />
        <StatCard label="Ticket promedio" value={k.won ? formatMoneyCompact(k.avgTicket, cur) : "—"} icon={<Wallet className="size-4" />} accent="text-indigo-600 bg-indigo-50" />
        <StatCard label="Conversión" value={formatPercent(k.conversion)} icon={<Percent className="size-4" />} hint="Cierres ÷ leads nuevos" accent="text-blue-600 bg-blue-50" />
        <StatCard label="Tiempo de cierre" value={days(k.avgCloseDays)} icon={<Clock className="size-4" />} hint="Del lead al cierre" accent="text-slate-600 bg-slate-100" />
        <StatCard label="Oportunidades perdidas" value={formatNumber(k.lost)} icon={<TrendingDown className="size-4" />} hint={`${formatMoneyCompact(k.lostValue, cur)} no concretados`} accent="text-rose-600 bg-rose-50" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AreaTrend title="Leads nuevos" description="Consultas recibidas en el periodo" data={chartData} series={[{ key: "leads", label: "Leads", color: SERIES[0] }]} />
        <ColumnsChart title="Valor cerrado" description={`Operaciones ganadas (${cur === "PEN" ? "soles" : "dólares"})`} data={chartData} series={[{ key: "wonValue", label: "Valor cerrado", color: SERIES[2] }]} unit={cur} empty="Aún no hay cierres en este periodo" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RankingCard
          title="Cierres por operación"
          description="Valor cerrado venta vs. alquiler"
          rows={data.byOperation.map((o) => ({ key: o.key, label: labelOf(PROPERTY_OPERATIONS, o.key), value: o.value, display: formatMoneyCompact(o.value, cur), sub: `${o.count} cierres` }))}
          empty="Sin cierres en el periodo"
          table={{ headers: ["Operación", "Cierres", "Valor"], rows: data.byOperation.map((o) => [labelOf(PROPERTY_OPERATIONS, o.key), o.count, formatMoneyCompact(o.value, cur)]) }}
        />
        <RankingCard
          title="Cierres por tipo de propiedad"
          rows={data.byType.map((o) => ({ key: o.key, label: lookups.propertyType(o.key), value: o.value, display: formatMoneyCompact(o.value, cur), sub: `${o.count} cierres` }))}
          color={SERIES[3]}
          empty="Sin cierres en el periodo"
        />
        <RankingCard
          title="Distritos con más cierres"
          rows={data.byDistrict.map((o) => ({ key: o.key, label: lookups.district(o.key), value: o.value, display: formatMoneyCompact(o.value, cur), sub: `${o.count} cierres` }))}
          color={SERIES[4]}
          empty="Sin cierres en el periodo"
        />
        <RankingCard
          title="Motivos de pérdida"
          description="Leads y oportunidades perdidos en el periodo"
          rows={data.lossReasons.map((o) => ({ key: o.key, label: lookups.lossReason(o.key), value: o.opportunities + o.leads, display: String(o.opportunities + o.leads), sub: o.opportunities ? `${o.opportunities} opp. · ${o.leads} leads` : `${o.leads} leads` }))}
          color={SERIES[7]}
          empty="Sin pérdidas registradas en el periodo"
          table={{ headers: ["Motivo", "Oportunidades", "Leads"], rows: data.lossReasons.map((o) => [lookups.lossReason(o.key), o.opportunities, o.leads]) }}
        />
        <Panel title="Fuentes de leads" description="Rendimiento por canal de origen" className="xl:col-span-2" bodyClassName="px-3">
          <Table
            headers={[{ label: "Fuente" }, { label: "Leads", right: true }, { label: "Cierres", right: true }, { label: "Conversión", right: true }, { label: "Valor cerrado", right: true }]}
            rows={data.sources.map((s) => [
              <span key="s" className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: lookups.sourceColor(s.key) }} />
                {lookups.source(s.key)}
              </span>,
              s.leads,
              s.won,
              formatPercent(s.conversion),
              formatMoneyCompact(s.wonValue, cur),
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}

// =============================================================================
export function TeamSection({ stats, cur }: { stats: AdvisorStats[]; cur: Currency }) {
  const rows = [...stats].sort((a, b) => b.won_value - a.won_value);
  return (
    <div className="space-y-4">
      <ColumnsChart
        title="Valor cerrado por vendedor"
        data={rows.map((r) => ({ label: r.full_name.split(" ")[0], value: r.won_value }))}
        series={[{ key: "value", label: "Valor cerrado", color: SERIES[2] }]}
        unit={cur}
        empty="Aún no hay cierres en este periodo"
      />
      <Panel title="Comparativo de vendedores" description="Haz clic en un nombre para ver su tablero individual." bodyClassName="px-3">
        <Table
          headers={[{ label: "Vendedor" }, { label: "Leads", right: true }, { label: "Contactados", right: true }, { label: "Visitas", right: true }, { label: "Opp. abiertas", right: true }, { label: "Pipeline", right: true }, { label: "Cierres", right: true }, { label: "Valor cerrado", right: true }, { label: "Conversión", right: true }, { label: "Vencidas", right: true }]}
          empty="No hay asesores activos"
          rows={rows.map((a) => [
            <Link key="n" href={`/team/${a.id}`} className="flex items-center gap-2 font-medium hover:text-primary">
              <UserAvatar name={a.full_name} src={a.avatar_url} size="xs" /> {a.full_name}
            </Link>,
            a.new_leads,
            formatPercent(a.contact_rate, 0),
            a.visits_done,
            a.open_opps,
            formatMoneyCompact(a.open_value, cur),
            a.won_count,
            <b key="v">{formatMoneyCompact(a.won_value, cur)}</b>,
            formatPercent(a.conversion),
            <span key="o" className={a.tasks_overdue > 5 ? "font-semibold text-rose-600" : undefined}>{a.tasks_overdue}</span>,
          ])}
        />
      </Panel>
    </div>
  );
}

// =============================================================================
export function PipelineSection({ data, cur, lookups, stages }: { data: PipelineReport; cur: Currency; lookups: Lookups; stages: StageDef[] }) {
  const stageLabel = (k: string) => stages.find((s) => s.key === k)?.label ?? lookups.stageLabel(k);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Oportunidades abiertas" value={formatNumber(data.totals.count)} icon={<Handshake className="size-4" />} href="/opportunities" accent="text-violet-600 bg-violet-50" />
        <StatCard label="Valor del pipeline" value={formatMoneyCompact(data.totals.value, cur)} icon={<Layers className="size-4" />} accent="text-indigo-600 bg-indigo-50" info="Suma de las oportunidades abiertas. Los alquileres se valorizan a 12 meses." />
        <StatCard label="Pipeline ponderado" value={formatMoneyCompact(data.totals.weighted, cur)} icon={<Wallet className="size-4" />} accent="text-teal-600 bg-teal-50" info="Valor × probabilidad de cierre de cada etapa." />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ColumnsChart
          title="Valor por etapa"
          description="Pipeline abierto: valor total vs. ponderado"
          data={data.byStage.map((s) => ({ label: stageLabel(s.stage), value: s.value, weighted: s.weighted }))}
          series={[
            { key: "value", label: "Valor", color: SERIES[0] },
            { key: "weighted", label: "Ponderado", color: SERIES[2] },
          ]}
          unit={cur}
          empty="No hay oportunidades abiertas"
        />
        <ColumnsChart
          title="Proyección de cierre"
          description="Por mes de cierre esperado"
          data={data.forecast.map((f) => ({ label: f.label, value: f.value, weighted: f.weighted }))}
          series={[
            { key: "value", label: "Valor", color: SERIES[0] },
            { key: "weighted", label: "Ponderado", color: SERIES[2] },
          ]}
          unit={cur}
          empty="No hay oportunidades abiertas"
        />
        <RankingCard
          title="Tiempo promedio por etapa"
          description="Días que las oportunidades permanecen en cada etapa (movimientos del periodo)"
          rows={data.timeInStage.map((t) => ({ key: t.stage, label: stageLabel(t.stage), value: t.avgDays, display: days(t.avgDays), sub: `${t.samples} mov.` }))}
          color={SERIES[3]}
          empty="Aún no hay movimientos entre etapas en el periodo"
        />
        <ColumnsChart
          title="Antigüedad en la etapa actual"
          description="Oportunidades abiertas según días sin cambiar de etapa"
          data={data.aging.map((a) => ({ label: a.bucket, count: a.count }))}
          series={[{ key: "count", label: "Oportunidades", color: SERIES[1] }]}
          empty="No hay oportunidades abiertas"
        />
      </div>
      <Panel title="Mayores oportunidades abiertas" description="Ordenadas por valor ponderado" bodyClassName="px-3">
        <Table
          headers={[{ label: "Cliente" }, { label: "Propiedad" }, { label: "Etapa" }, { label: "Vendedor" }, { label: "Valor", right: true }, { label: "Prob.", right: true }, { label: "Ponderado", right: true }, { label: "Días en etapa", right: true }]}
          rows={data.top.map((o) => [
            <Link key="c" href={`/opportunities/${o.id}`} className="font-medium hover:text-primary">{o.party}</Link>,
            o.property_code,
            stageLabel(o.stage),
            lookups.userName(o.assigned_to),
            formatMoneyCompact(o.value, cur),
            `${o.probability}%`,
            <b key="w">{formatMoneyCompact(o.weighted, cur)}</b>,
            <span key="d" className={o.days_in_stage > 14 ? "text-amber-700" : undefined}>{o.days_in_stage}</span>,
          ])}
          empty="No hay oportunidades abiertas"
        />
      </Panel>
    </div>
  );
}

// =============================================================================
export function PropertiesSection({ data, cur, lookups }: { data: PropertiesReport; cur: Currency; lookups: Lookups }) {
  const total = data.byStatus.reduce((a, s) => a + s.count, 0);
  const available = data.byStatus.find((s) => s.key === "available")?.count ?? 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Propiedades en cartera" value={formatNumber(total)} icon={<Home className="size-4" />} href="/properties" />
        <StatCard label="Disponibles" value={formatNumber(available)} icon={<Home className="size-4" />} accent="text-emerald-600 bg-emerald-50" href="/properties?status=available" />
        <StatCard label="Valor en venta" value={formatMoneyCompact(data.inventoryValue, cur)} icon={<Wallet className="size-4" />} hint="Inventario disponible y reservado" accent="text-indigo-600 bg-indigo-50" />
        <StatCard label="Días en el mercado" value={days(data.daysOnMarket)} icon={<Timer className="size-4" />} hint={data.closedInPeriod ? `${data.closedInPeriod} cerradas en el periodo` : "Sin cierres en el periodo"} accent="text-slate-600 bg-slate-100" info="Promedio de días entre el ingreso de la propiedad y su cierre." />
        <StatCard label="Sin fotos" value={formatNumber(data.withoutPhotos)} icon={<AlertTriangle className="size-4" />} hint="Propiedades activas sin imágenes" accent={data.withoutPhotos ? "text-amber-600 bg-amber-50" : "text-slate-600 bg-slate-100"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RankingCard title="Cartera por estado" rows={data.byStatus.map((s) => ({ key: s.key, label: labelOf(PROPERTY_STATUSES, s.key), value: s.count, display: String(s.count) }))} />
        <RankingCard title="Inventario por distrito" description="Disponibles y reservadas" color={SERIES[4]} rows={data.byDistrict.map((d) => ({ key: d.key, label: lookups.district(d.key), value: d.count, display: String(d.count), sub: `prom. ${formatMoneyCompact(d.avgPrice, cur)}` }))} />
        <RankingCard title="Inventario por tipo" color={SERIES[3]} rows={data.byType.map((d) => ({ key: d.key, label: lookups.propertyType(d.key), value: d.count, display: String(d.count) }))} />
        <RankingCard title="Más consultadas" description="Leads que preguntaron por la propiedad" color={SERIES[0]} rows={data.topInquired.map((p) => ({ key: p.id, label: `${p.code} · ${p.title}`, value: p.count, display: `${p.count}`, href: `/properties/${p.id}` }))} empty="Sin consultas en el periodo" />
        <RankingCard title="Más visitadas" description="Visitas realizadas" color={SERIES[1]} rows={data.topVisited.map((p) => ({ key: p.id, label: `${p.code} · ${p.title}`, value: p.count, display: `${p.count}`, href: `/properties/${p.id}` }))} empty="Sin visitas realizadas en el periodo" />
        <StatCard label="Cambios de precio" value={formatNumber(data.priceChanges)} icon={<BadgeDollarSign className="size-4" />} hint="Registrados en el periodo" accent="text-orange-600 bg-orange-50" className="self-start" />
      </div>
      <Panel title="Propiedades estancadas" description="Disponibles hace más de 45 días, sin consultas ni visitas en los últimos 30. Candidatas a revisar precio, fotos o difusión." bodyClassName="px-3">
        <Table
          headers={[{ label: "Propiedad" }, { label: "Distrito" }, { label: "Asesor" }, { label: "Precio", right: true }, { label: "Días publicada", right: true }]}
          rows={data.stale.map((p) => [
            <Link key="p" href={`/properties/${p.id}`} className="font-medium hover:text-primary">
              {p.code} · {p.title}
            </Link>,
            lookups.district(p.district),
            p.advisor_id ? lookups.userName(p.advisor_id) : "—",
            formatMoney(p.price, p.currency),
            p.days,
          ])}
          empty="No hay propiedades estancadas. Buen trabajo."
        />
      </Panel>
    </div>
  );
}

// =============================================================================
export function FollowupSection({ data }: { data: FollowupReport }) {
  const fr = data.firstResponse;
  const within = fr.total ? (fr.withinTarget / fr.total) * 100 : 0;
  const v = data.visits;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Primera respuesta" value={fr.avgHours == null ? "—" : fr.avgHours < 1 ? `${Math.round(fr.avgHours * 60)} min` : `${fr.avgHours.toFixed(1)} h`} icon={<Clock className="size-4" />} hint={fr.total ? `${formatPercent(within, 0)} dentro de ${fr.targetHours} h` : "Sin leads en el periodo"} accent="text-blue-600 bg-blue-50" info="Tiempo promedio entre la llegada del lead y el primer contacto registrado." />
        <StatCard label="Leads sin contactar" value={formatNumber(data.leadAlerts.uncontacted)} icon={<AlertTriangle className="size-4" />} href="/leads?alert=uncontacted" accent={data.leadAlerts.uncontacted ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-100"} />
        <StatCard label="Seguimientos vencidos" value={formatNumber(data.leadAlerts.overdue_follow_up)} icon={<CalendarCheck className="size-4" />} href="/leads?alert=overdue_follow_up" accent={data.leadAlerts.overdue_follow_up ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-100"} />
        <StatCard label="Oportunidades detenidas" value={formatNumber(data.stalledOpps)} icon={<Handshake className="size-4" />} href="/opportunities" accent={data.stalledOpps ? "text-amber-600 bg-amber-50" : "text-slate-600 bg-slate-100"} />
        <StatCard label="Visitas realizadas" value={`${v.completed}/${v.total}`} icon={<CalendarCheck className="size-4" />} hint={`${v.cancelled} canceladas · ${v.noShow} no asistieron`} accent="text-amber-600 bg-amber-50" href="/visits" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RankingCard
          title="Alertas de leads"
          description="Estado actual de la cartera (no depende del periodo)"
          color={SERIES[7]}
          rows={(Object.keys(LEAD_ALERT_LABELS) as Array<keyof typeof LEAD_ALERT_LABELS>).map((k) => ({ key: k, label: LEAD_ALERT_LABELS[k], value: data.leadAlerts[k], display: String(data.leadAlerts[k]), href: `/leads?alert=${k}` }))}
        />
        <RankingCard
          title="Resultado de las visitas"
          description="Cómo salieron las visitas realizadas"
          color={SERIES[2]}
          rows={v.outcomes.map((o) => ({ key: o.key, label: labelOf(VISIT_OUTCOMES, o.key), value: o.count, display: String(o.count) }))}
          empty="Sin visitas realizadas en el periodo"
        />
      </div>
      <Panel title="Cumplimiento de tareas" description="Tareas completadas en el periodo vs. vencidas hoy" bodyClassName="px-3">
        <Table
          headers={[{ label: "Responsable" }, { label: "Completadas", right: true }, { label: "Vencidas", right: true }, { label: "Pendientes", right: true }, { label: "Cumplimiento", right: true }]}
          rows={data.tasks.map((t) => [
            <Link key="n" href={`/tasks?user=${t.id}`} className="font-medium hover:text-primary">{t.name}</Link>,
            t.done,
            <span key="o" className={t.overdue > 5 ? "font-semibold text-rose-600" : undefined}>{t.overdue}</span>,
            t.open,
            formatPercent(t.rate, 0),
          ])}
          empty="Sin tareas registradas"
        />
      </Panel>
    </div>
  );
}
