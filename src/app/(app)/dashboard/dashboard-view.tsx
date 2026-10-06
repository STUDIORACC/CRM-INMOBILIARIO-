import { BadgeDollarSign, Clock, Eye, Handshake, Layers, MapPin, Percent, Target, Trophy, UserPlus, Users, Wallet } from "lucide-react";
import { ActivityChart } from "@/components/charts/activity-chart";
import { FunnelCard, RankingCard } from "@/components/charts/bars";
import { LeadsEvolutionChart } from "@/components/charts/leads-chart";
import { StatCard, pctChange } from "@/components/shared/stat-card";
import { LEAD_STAGES, labelOf, type Currency } from "@/lib/domain/constants";
import type { ResolvedPeriod } from "@/lib/domain/dates";
import { formatMoneyCompact, formatNumber, formatPercent } from "@/lib/domain/money";
import { SERIES } from "@/lib/domain/viz";
import type { Lookups } from "@/lib/types/catalogs";
import type { DashboardData } from "@/lib/services/dashboard";
import { AlertsCard, HotLeadsCard, RecentActivityCard, StalledOppsCard, TodayTasksCard, UpcomingVisitsCard } from "./widgets";

/** Cuerpo del dashboard (KPIs, gráficos y listas de acción). Se reutiliza en el detalle de cada vendedor. */
export function DashboardView({ data, period, cur, global, ownerId, lookups }: { data: DashboardData; period: ResolvedPeriod; cur: Currency; global: boolean; ownerId: string | null; lookups: Lookups }) {
  const k = data.kpis;
  const funnelSteps = data.funnel.map((f) => ({ ...f, label: labelOf(LEAD_STAGES, f.stage) }));
  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <StatCard label="Leads nuevos" value={formatNumber(k.newLeads.value)} icon={<UserPlus className="size-4" />} delta={{ value: pctChange(k.newLeads.value, k.newLeads.prev) }} href="/leads" info="Leads creados durante el periodo seleccionado." />
        <StatCard label="Leads activos" value={formatNumber(k.activeLeads)} icon={<Users className="size-4" />} hint="En gestión ahora mismo" href="/leads" accent="text-sky-600 bg-sky-50" info="Leads que no están cerrados ni perdidos (no depende del periodo)." />
        <StatCard label="Oportunidades abiertas" value={formatNumber(k.openOpportunities.count)} icon={<Target className="size-4" />} hint="En el pipeline" href="/opportunities" accent="text-violet-600 bg-violet-50" />
        <StatCard label="Valor del pipeline" value={formatMoneyCompact(k.openOpportunities.value, cur)} icon={<Layers className="size-4" />} hint="Suma de oportunidades abiertas" href="/opportunities" accent="text-indigo-600 bg-indigo-50" info="Valor total de las oportunidades abiertas. Los alquileres se valorizan a 12 meses; los montos en otra moneda se convierten con el tipo de cambio de la empresa." />
        <StatCard label="Pipeline ponderado" value={formatMoneyCompact(k.openOpportunities.weighted, cur)} icon={<Wallet className="size-4" />} hint="Valor × probabilidad de cierre" href="/opportunities" accent="text-teal-600 bg-teal-50" info="Cada oportunidad aporta su valor multiplicado por su probabilidad de cierre (p. ej. S/ 500,000 × 75% = S/ 375,000)." />
        <StatCard label="Visitas próximas" value={formatNumber(k.upcomingVisits)} icon={<MapPin className="size-4" />} hint="Programadas en los próximos 7 días" href="/visits" accent="text-amber-600 bg-amber-50" />
        <StatCard label="Visitas realizadas" value={formatNumber(k.visitsDone.value)} icon={<Eye className="size-4" />} delta={{ value: pctChange(k.visitsDone.value, k.visitsDone.prev) }} href="/visits?status=completed" accent="text-orange-600 bg-orange-50" />
        <StatCard label="En negociación" value={formatNumber(k.negotiations.count)} icon={<Handshake className="size-4" />} hint={`${formatMoneyCompact(k.negotiations.value, cur)} en juego`} href="/opportunities" accent="text-pink-600 bg-pink-50" info="Oportunidades en las etapas de negociación y reserva." />
        <StatCard label="Operaciones cerradas" value={formatNumber(k.closedDeals.value)} icon={<Trophy className="size-4" />} delta={{ value: pctChange(k.closedDeals.value, k.closedDeals.prev) }} href="/opportunities" accent="text-emerald-600 bg-emerald-50" />
        <StatCard label="Valor cerrado" value={formatMoneyCompact(k.closedValue.value, cur)} icon={<BadgeDollarSign className="size-4" />} delta={{ value: pctChange(k.closedValue.value, k.closedValue.prev) }} href="/reports" accent="text-emerald-600 bg-emerald-50" />
        <StatCard label="Conversión" value={formatPercent(k.conversion.value)} icon={<Percent className="size-4" />} delta={{ value: pctChange(k.conversion.value, k.conversion.prev) }} accent="text-blue-600 bg-blue-50" info="Operaciones cerradas del periodo ÷ leads nuevos del periodo." />
        <StatCard label="Tiempo de cierre" value={k.avgCloseDays.value ? `${k.avgCloseDays.value.toFixed(0)} días` : "—"} icon={<Clock className="size-4" />} delta={k.avgCloseDays.value ? { value: pctChange(k.avgCloseDays.value, k.avgCloseDays.prev), inverse: true } : undefined} hint="Sin cierres en el periodo" accent="text-slate-600 bg-slate-100" info="Promedio de días entre el ingreso del lead y el cierre ganado." />
      </div>

      {/* Alertas + tareas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AlertsCard alerts={data.alerts} />
        <TodayTasksCard tasks={data.todayTasks} />
      </div>

      {/* Evolución y funnel */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <LeadsEvolutionChart series={data.leadsSeries} initial={data.activity.granularity} />
        </div>
        <div className="xl:col-span-2">
          <FunnelCard steps={funnelSteps} lost={data.lostLeads} total={data.funnel[0]?.count ?? 0} />
        </div>
      </div>

      {/* Ranking, fuentes, conversión */}
      <div className={`grid gap-4 ${global ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2"}`}>
        {global && (
          <RankingCard
            title="Ventas por vendedor"
            description={`Valor cerrado en ${period.label.toLowerCase()}`}
            rows={data.salesByAdvisor.map((a) => ({
              key: a.id,
              label: a.name,
              value: a.value,
              display: formatMoneyCompact(a.value, cur),
              sub: `${a.count} ${a.count === 1 ? "cierre" : "cierres"}`,
              href: `/team/${a.id}`,
              avatar: { name: a.name, src: lookups.user(a.id)?.avatarUrl },
            }))}
            table={{ headers: ["Vendedor", "Cierres", "Valor"], rows: data.salesByAdvisor.map((a) => [a.name, a.count, formatMoneyCompact(a.value, cur)]) }}
          />
        )}
        <RankingCard
          title="Leads por fuente"
          description="Origen de los leads del periodo"
          rows={data.leadsBySource.map((s) => ({ key: s.key, label: lookups.source(s.key), value: s.count, display: String(s.count), sub: s.won ? `${s.won} cerrados` : undefined }))}
          table={{ headers: ["Fuente", "Leads", "Cierres", "Conversión"], rows: data.leadsBySource.map((s) => [lookups.source(s.key), s.count, s.won, formatPercent(s.conversion)]) }}
        />
        <RankingCard
          title="Conversión por fuente"
          description="Cierres del periodo ÷ leads de la fuente"
          color={SERIES[2]}
          rows={[...data.leadsBySource].sort((a, b) => b.conversion - a.conversion).map((s) => ({ key: s.key, label: lookups.source(s.key), value: s.conversion, display: formatPercent(s.conversion), sub: `${s.won}/${s.count}` }))}
        />
        {global && (
          <RankingCard
            title="Conversión por vendedor"
            description="Cierres del periodo ÷ leads asignados"
            color={SERIES[2]}
            rows={data.conversionByAdvisor.map((a) => ({ key: a.id, label: a.name, value: a.conversion, display: formatPercent(a.conversion), sub: `${a.won}/${a.leads}`, href: `/team/${a.id}`, avatar: { name: a.name, src: lookups.user(a.id)?.avatarUrl } }))}
          />
        )}
        <RankingCard
          title="Propiedades más consultadas"
          description="Leads que preguntaron por la propiedad"
          rows={data.topInquired.map((p) => ({ key: p.id, label: `${p.code} · ${p.title}`, value: p.count, display: `${p.count} consultas`, href: `/properties/${p.id}` }))}
          color={SERIES[3]}
          empty="Aún no hay consultas por propiedad en este periodo"
        />
        <RankingCard
          title="Propiedades con más visitas"
          description="Visitas realizadas en el periodo"
          rows={data.topVisited.map((p) => ({ key: p.id, label: `${p.code} · ${p.title}`, value: p.count, display: `${p.count} visitas`, href: `/properties/${p.id}` }))}
          color={SERIES[1]}
          empty="Aún no hay visitas realizadas en este periodo"
        />
      </div>

      {/* Actividad + feed */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <ActivityChart activity={data.activity} />
        </div>
        <div className="xl:col-span-2">
          <RecentActivityCard events={data.recent} showActor={global} />
        </div>
      </div>

      {/* Listas de acción */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <UpcomingVisitsCard visits={data.upcoming} showAdvisor={global && !ownerId} />
        <HotLeadsCard leads={data.hotLeads} lookups={lookups} />
        <StalledOppsCard opps={data.stalledOpportunities} lookups={lookups} />
      </div>
    </>
  );
}
