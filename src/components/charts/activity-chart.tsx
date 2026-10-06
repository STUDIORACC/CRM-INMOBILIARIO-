"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData } from "@/lib/services/dashboard";
import { AXIS, GRID, SERIES, SURFACE } from "@/lib/domain/viz";
import { ChartCard, ChartTooltipBox, Legend } from "./chart-card";

const KEYS = [
  { key: "calls", label: "Llamadas", color: SERIES[0] },
  { key: "messages", label: "Mensajes", color: SERIES[1] },
  { key: "visits", label: "Visitas y reuniones", color: SERIES[2] },
  { key: "tasks", label: "Tareas completadas", color: SERIES[3] },
] as const;

export function ActivityChart({ activity }: { activity: DashboardData["activity"] }) {
  const { series, totals } = activity;
  return (
    <ChartCard
      title="Actividad comercial"
      description="Llamadas, mensajes, visitas y tareas completadas"
      table={{
        headers: ["Periodo", ...KEYS.map((k) => k.label)],
        rows: series.map((s) => [s.label, s.calls, s.messages, s.visits, s.tasks]),
      }}
    >
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Llamadas", totals.calls],
          ["Mensajes", totals.messages],
          ["Visitas/reuniones", totals.visits],
          ["Tareas completadas", totals.tasksCompleted],
          ["Seguimientos pendientes", totals.pendingFollowUps],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="text-lg leading-none font-semibold tabular">{v as number}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      <Legend items={KEYS.map((k) => ({ label: k.label, color: k.color }))} />
      <div className="mt-2 h-[200px]" role="img" aria-label="Gráfico de barras apiladas de actividad comercial por periodo">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} minTickGap={20} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} width={40} />
            <Tooltip
              cursor={{ fill: "rgba(42,120,214,0.06)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltipBox
                    title={String(label)}
                    rows={KEYS.map((k) => ({ color: k.color, label: k.label, value: (payload.find((p) => p.dataKey === k.key)?.value as number) ?? 0 }))}
                  />
                ) : null
              }
            />
            {KEYS.map((k, i) => (
              <Bar key={k.key} dataKey={k.key} stackId="a" fill={k.color} stroke={SURFACE} strokeWidth={1.5} radius={i === KEYS.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={22} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
