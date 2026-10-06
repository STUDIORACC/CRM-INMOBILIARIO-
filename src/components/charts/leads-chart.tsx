"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SeriesPoint } from "@/lib/services/dashboard";
import { AXIS, GRID, SERIES } from "@/lib/domain/viz";
import { ChartCard, ChartTooltipBox } from "./chart-card";

type Granularity = "day" | "week" | "month";
const LABELS: Record<Granularity, string> = { day: "Día", week: "Semana", month: "Mes" };

export function LeadsEvolutionChart({ series, initial }: { series: Record<Granularity, SeriesPoint[]>; initial: Granularity }) {
  const [g, setG] = useState<Granularity>(initial);
  const data = series[g];
  const total = data.reduce((a, p) => a + p.value, 0);
  const unit = g === "day" ? "Leads del día" : g === "week" ? "Leads de la semana" : "Leads del mes";

  return (
    <ChartCard
      title="Evolución de leads"
      description={`${total.toLocaleString("en-US")} leads en el periodo`}
      table={{ headers: [LABELS[g], "Leads"], rows: data.map((d) => [d.label, d.value]) }}
      actions={
        <ToggleGroup type="single" value={g} onValueChange={(v) => v && setG(v as Granularity)} size="sm" variant="outline" aria-label="Agrupar por">
          {(Object.keys(LABELS) as Granularity[]).map((k) => (
            <ToggleGroupItem key={k} value={k} className="px-2.5 text-xs">
              {LABELS[k]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      <div className="h-[250px]" role="img" aria-label={`Gráfico de línea: ${total} leads en el periodo agrupados por ${LABELS[g].toLowerCase()}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.2} />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} minTickGap={28} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} width={40} />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? <ChartTooltipBox title={String(label)} rows={[{ color: SERIES[0], label: unit, value: payload[0].value as number }]} /> : null
              }
            />
            <Area type="monotone" dataKey="value" stroke={SERIES[0]} strokeWidth={2} fill="url(#leadsFill)" dot={false} activeDot={{ r: 4, fill: SERIES[0], stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
