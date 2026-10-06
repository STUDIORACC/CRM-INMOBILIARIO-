"use client";

import Link from "next/link";
import { RAMP, DANGER, SERIES } from "@/lib/domain/viz";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ChartCard } from "./chart-card";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Texto del valor (ya formateado). */
  display: string;
  sub?: string;
  href?: string;
  /** Avatar opcional junto al nombre (se renderiza en el cliente). */
  avatar?: { name: string; src?: string | null };
}

/** Lista de barras horizontales (rankings): un solo matiz, valor siempre visible. */
export function BarList({ rows, color = SERIES[0], empty = "Sin datos en el periodo", max }: { rows: BarRow[]; color?: string; empty?: string; max?: number }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = Math.max(r.value > 0 ? 3 : 0, (r.value / top) * 100);
        const body = (
          <div className="group">
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {r.avatar && <UserAvatar name={r.avatar.name} src={r.avatar.src} size="xs" />}
                <span className="truncate">{r.label}</span>
                {r.sub && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{r.sub}</span>}
              </span>
              <span className="shrink-0 font-medium tabular">{r.display}</span>
            </div>
            <div className="h-2 rounded-full bg-muted" title={`${r.label}: ${r.display}`}>
              <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        );
        return <li key={r.key}>{r.href ? <Link href={r.href} className="block rounded-md hover:bg-muted/50">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

export function RankingCard({ title, description, rows, color, table, empty }: { title: string; description?: string; rows: BarRow[]; color?: string; table?: { headers: string[]; rows: Array<Array<string | number>> }; empty?: string }) {
  return (
    <ChartCard title={title} description={description} table={table ?? { headers: ["Nombre", "Valor"], rows: rows.map((r) => [r.label, r.display]) }}>
      <BarList rows={rows} color={color} empty={empty} />
    </ChartCard>
  );
}

/** Embudo comercial: barras con rampa ordinal y conversión entre etapas. */
export function FunnelCard({ steps, lost, total }: { steps: Array<{ stage: string; label: string; count: number }>; lost: number; total: number }) {
  const top = Math.max(steps[0]?.count ?? 0, 1);
  return (
    <ChartCard
      title="Funnel comercial"
      description="Leads que avanzaron a cada etapa durante el periodo"
      table={{
        headers: ["Etapa", "Leads", "% del total"],
        rows: [...steps.map((s) => [s.label, s.count, `${total ? ((s.count / total) * 100).toFixed(1) : 0}%`]), ["Perdidos", lost, `${total ? ((lost / total) * 100).toFixed(1) : 0}%`]],
      }}
    >
      <ul className="space-y-2" aria-label="Embudo de conversión">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].count : null;
          const rawStep = prev ? (s.count / prev) * 100 : null;
          const step = rawStep != null && rawStep <= 100 ? rawStep : null;
          return (
            <li key={s.stage} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[7.5rem_1fr_auto]">
              <span className="truncate text-sm text-muted-foreground">{s.label}</span>
              <div className="h-6 rounded-md bg-muted/70" title={`${s.label}: ${s.count} leads`}>
                <div className="flex h-full items-center rounded-md transition-[width]" style={{ width: `${Math.max(s.count > 0 ? 2 : 0, (s.count / top) * 100)}%`, backgroundColor: RAMP[Math.min(i, RAMP.length - 1)] }} />
              </div>
              <span className="w-24 text-right text-sm tabular">
                <b className="font-semibold">{s.count}</b>
                {step != null && <span className="ml-1.5 text-xs text-muted-foreground">{step.toFixed(0)}%</span>}
              </span>
            </li>
          );
        })}
        <li className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 border-t pt-2 sm:grid-cols-[7.5rem_1fr_auto]">
          <span className="truncate text-sm text-muted-foreground">Perdidos</span>
          <div className="h-6 rounded-md bg-muted/70">
            <div className={cn("h-full rounded-md")} style={{ width: `${Math.max(lost > 0 ? 2 : 0, (lost / top) * 100)}%`, backgroundColor: DANGER, opacity: 0.85 }} />
          </div>
          <span className="w-24 text-right text-sm tabular">
            <b className="font-semibold">{lost}</b>
            <span className="ml-1.5 text-xs text-muted-foreground">{total ? ((lost / total) * 100).toFixed(0) : 0}%</span>
          </span>
        </li>
      </ul>
    </ChartCard>
  );
}
