import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, BadgeDollarSign, CheckSquare, Settings2, Trophy, UserCheck, Wallet } from "lucide-react";
import { RankingCard } from "@/components/charts/bars";
import { OptBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodFilter } from "@/components/shared/period-filter";
import { StatCard } from "@/components/shared/stat-card";
import { NoAccess } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { ROLES } from "@/lib/domain/constants";
import { isPeriodKey, resolvePeriod, type PeriodKey } from "@/lib/domain/dates";
import { formatMoneyCompact, formatNumber, formatPercent } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { SERIES } from "@/lib/domain/viz";
import { getTeamStats, type AdvisorStats } from "@/lib/services/team";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Vendedores" };
export const dynamic = "force-dynamic";

const PERIODS: PeriodKey[] = ["today", "week", "month", "last_month", "30d", "90d", "custom"];

type SortKey = "won_value" | "won_count" | "conversion" | "new_leads" | "visits_done" | "open_value" | "tasks_overdue";
const SORTS: Array<{ key: SortKey; label: string; hint?: string }> = [
  { key: "won_value", label: "Valor cerrado" },
  { key: "won_count", label: "Cierres" },
  { key: "conversion", label: "Conversión" },
  { key: "new_leads", label: "Leads" },
  { key: "visits_done", label: "Visitas" },
  { key: "open_value", label: "Pipeline" },
  { key: "tasks_overdue", label: "Vencidas" },
];

const hours = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  if (!can(session.role, "team.view")) return <NoAccess />;
  const catalogs = await getCatalogs();
  const cur = catalogs.company.currency;

  const periodKey: PeriodKey = isPeriodKey(sp.period) ? sp.period : "30d";
  const period = resolvePeriod(periodKey, { from: sp.from, to: sp.to });
  const sort: SortKey = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as SortKey) : "won_value";
  const dir = sp.dir === "asc" ? "asc" : "desc";

  const all = await withUser({ id: session.id, email: session.email }, (db) => getTeamStats(db, period, cur, catalogs.company.usdRate));
  const advisors = all.filter((a) => a.role === "advisor" && a.status === "active");
  const ranked = [...advisors].sort((a, b) => {
    const d = (Number(b[sort]) - Number(a[sort])) * (dir === "desc" ? 1 : -1);
    return d || b.won_value - a.won_value || a.full_name.localeCompare(b.full_name);
  });
  const others = all.filter((a) => !(a.role === "advisor" && a.status === "active"));

  const sum = (f: (a: AdvisorStats) => number) => advisors.reduce((t, a) => t + f(a), 0);
  const teamLeads = sum((a) => a.new_leads);
  const teamWon = sum((a) => a.won_count);
  const wonValue = sum((a) => a.won_value);
  const weighted = sum((a) => a.weighted_value);
  const overdue = sum((a) => a.tasks_overdue);

  const sortHref = (key: SortKey) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "sort" && k !== "dir") q.set(k, v);
    q.set("sort", key);
    q.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    return `/team?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendedores"
        description={`Rendimiento del equipo comercial · ${period.label.toLowerCase()}. Todo se calcula con los datos reales del CRM.`}
        actions={
          <>
            {can(session.role, "settings.manage") && (
              <Button variant="outline" asChild>
                <Link href="/settings?tab=users">
                  <Settings2 /> Gestionar usuarios
                </Link>
              </Button>
            )}
            <PeriodFilter options={PERIODS} value={period.key} from={period.fromDate} to={period.toDate} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Vendedores activos" value={formatNumber(advisors.length)} icon={<UserCheck className="size-4" />} hint="Con rol de asesor" />
        <StatCard label="Cierres del equipo" value={formatNumber(teamWon)} icon={<Trophy className="size-4" />} hint={`${formatPercent(teamLeads ? Math.min(100, (teamWon / teamLeads) * 100) : 0)} de conversión`} accent="text-emerald-600 bg-emerald-50" />
        <StatCard label="Valor cerrado" value={formatMoneyCompact(wonValue, cur)} icon={<BadgeDollarSign className="size-4" />} accent="text-emerald-600 bg-emerald-50" />
        <StatCard label="Pipeline ponderado" value={formatMoneyCompact(weighted, cur)} icon={<Wallet className="size-4" />} hint="Valor × probabilidad" accent="text-teal-600 bg-teal-50" />
        <StatCard label="Tareas vencidas" value={formatNumber(overdue)} icon={<CheckSquare className="size-4" />} hint="Entre todo el equipo" accent={overdue > 0 ? "text-rose-600 bg-rose-50" : "text-slate-600 bg-slate-100"} href="/tasks?tab=overdue" />
      </div>

      <section className="rounded-xl border bg-card shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold">Ranking de vendedores</h2>
            <p className="text-xs text-muted-foreground">Ordena por cualquier columna. Haz clic en un vendedor para ver su tablero.</p>
          </div>
          <div className="flex flex-wrap gap-1 md:hidden">
            {SORTS.slice(0, 4).map((s) => (
              <Link key={s.key} href={sortHref(s.key)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", sort === s.key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {s.label}
              </Link>
            ))}
          </div>
        </header>

        {ranked.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Aún no hay asesores activos. Crea usuarios con rol Asesor en Configuración.</p>
        ) : (
          <>
            {/* Escritorio */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="w-10 px-4 py-2.5 font-medium">#</th>
                    <th className="px-2 py-2.5 font-medium">Vendedor</th>
                    {SORTS.map((s) => (
                      <th key={s.key} className="px-3 py-2.5 text-right font-medium whitespace-nowrap">
                        <Link href={sortHref(s.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === s.key && "text-foreground")}>
                          {s.label}
                          {sort === s.key && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                        </Link>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap" title="Tiempo promedio hasta el primer contacto">
                      1.ª respuesta
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ranked.map((a, i) => (
                    <tr key={a.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 text-xs font-semibold text-muted-foreground tabular">{i + 1}</td>
                      <td className="px-2 py-3">
                        <Link href={`/team/${a.id}`} className="flex items-center gap-2.5 hover:text-primary">
                          <UserAvatar name={a.full_name} src={a.avatar_url} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.full_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{a.active_leads} leads activos · {a.hot_leads} calientes</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular">{formatMoneyCompact(a.won_value, cur)}</td>
                      <td className="px-3 py-3 text-right tabular">{a.won_count}</td>
                      <td className="px-3 py-3 text-right tabular">
                        <span className={cn(a.conversion >= 10 ? "text-emerald-700" : a.conversion === 0 ? "text-muted-foreground" : "")}>{formatPercent(a.conversion)}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular">{a.new_leads}</td>
                      <td className="px-3 py-3 text-right tabular">{a.visits_done}</td>
                      <td className="px-3 py-3 text-right tabular">
                        {formatMoneyCompact(a.open_value, cur)}
                        <span className="block text-[11px] text-muted-foreground">{a.open_opps} opp.</span>
                      </td>
                      <td className={cn("px-3 py-3 text-right tabular", a.tasks_overdue > 5 ? "font-semibold text-rose-600" : a.tasks_overdue > 0 ? "text-amber-700" : "text-muted-foreground")}>{a.tasks_overdue}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground tabular">{hours(a.avg_response_hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil */}
            <ul className="divide-y md:hidden">
              {ranked.map((a, i) => (
                <li key={a.id}>
                  <Link href={`/team/${a.id}`} className="block px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center text-xs font-semibold text-muted-foreground tabular">{i + 1}</span>
                      <UserAvatar name={a.full_name} src={a.avatar_url} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{a.full_name}</div>
                        <div className="text-xs text-muted-foreground">{formatMoneyCompact(a.won_value, cur)} · {a.won_count} cierres · {formatPercent(a.conversion)}</div>
                      </div>
                    </div>
                    <dl className="mt-2.5 grid grid-cols-4 gap-2 text-center text-xs">
                      {[
                        ["Leads", a.new_leads],
                        ["Visitas", a.visits_done],
                        ["Opp. abiertas", a.open_opps],
                        ["Vencidas", a.tasks_overdue],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-muted/60 py-1.5">
                          <dd className="text-sm font-semibold tabular">{v}</dd>
                          <dt className="text-[10px] text-muted-foreground">{k}</dt>
                        </div>
                      ))}
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankingCard
          title="Valor cerrado"
          description={`Operaciones ganadas en ${period.label.toLowerCase()}`}
          rows={[...advisors].sort((a, b) => b.won_value - a.won_value).map((a) => ({ key: a.id, label: a.full_name, value: a.won_value, display: formatMoneyCompact(a.won_value, cur), sub: `${a.won_count} ${a.won_count === 1 ? "cierre" : "cierres"}`, href: `/team/${a.id}`, avatar: { name: a.full_name, src: a.avatar_url } }))}
          table={{ headers: ["Vendedor", "Cierres", "Valor cerrado"], rows: advisors.map((a) => [a.full_name, a.won_count, formatMoneyCompact(a.won_value, cur)]) }}
        />
        <RankingCard
          title="Conversión"
          description="Cierres del periodo ÷ leads nuevos"
          color={SERIES[2]}
          rows={[...advisors].sort((a, b) => b.conversion - a.conversion).map((a) => ({ key: a.id, label: a.full_name, value: a.conversion, display: formatPercent(a.conversion), sub: `${a.won_count}/${a.new_leads}`, href: `/team/${a.id}`, avatar: { name: a.full_name, src: a.avatar_url } }))}
        />
        <RankingCard
          title="Seguimiento al día"
          description="Tareas vencidas por vendedor (menos es mejor)"
          color={SERIES[4]}
          rows={[...advisors].sort((a, b) => b.tasks_overdue - a.tasks_overdue).map((a) => ({ key: a.id, label: a.full_name, value: a.tasks_overdue, display: String(a.tasks_overdue), sub: `${a.tasks_done} completadas`, href: `/tasks?tab=overdue&user=${a.id}`, avatar: { name: a.full_name, src: a.avatar_url } }))}
          empty="Nadie tiene tareas vencidas"
        />
        <RankingCard
          title="Actividad comercial"
          description="Llamadas, mensajes, visitas y reuniones registradas"
          color={SERIES[1]}
          rows={[...advisors].sort((a, b) => b.activities - a.activities).map((a) => ({ key: a.id, label: a.full_name, value: a.activities, display: String(a.activities), sub: `${formatPercent(a.contact_rate, 0)} leads contactados`, href: `/team/${a.id}`, avatar: { name: a.full_name, src: a.avatar_url } }))}
        />
      </div>

      {others.length > 0 && (
        <section className="rounded-xl border bg-card shadow-card">
          <header className="border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Gerencia, administración e inactivos</h2>
          </header>
          <ul className="divide-y">
            {others.map((a) => (
              <li key={a.id}>
                <Link href={`/team/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                  <UserAvatar name={a.full_name} src={a.avatar_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.email}</div>
                  </div>
                  <OptBadge list={ROLES} value={a.role} />
                  {a.status === "inactive" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Inactivo</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
