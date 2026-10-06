"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID } from "@/lib/domain/viz";
import { formatMoneyCompact } from "@/lib/domain/money";
import type { Currency } from "@/lib/domain/constants";
import { ChartCard, ChartTooltipBox, Legend } from "./chart-card";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

type Datum = { label: string } & Record<string, string | number>;

interface Props {
  title: string;
  description?: string;
  data: Datum[];
  series: ChartSeries[];
  /** Formato de los valores (tooltip, eje y tabla). */
  unit?: "count" | Currency;
  height?: number;
  empty?: string;
}

function fmt(v: number, unit: Props["unit"]): string {
  if (unit === "PEN" || unit === "USD") return formatMoneyCompact(v, unit);
  return v.toLocaleString("es-PE");
}

function tableOf(data: Datum[], series: ChartSeries[], unit: Props["unit"], first: string) {
  return { headers: [first, ...series.map((s) => s.label)], rows: data.map((d) => [d.label, ...series.map((s) => fmt(Number(d[s.key] ?? 0), unit))]) };
}

/** Columnas agrupadas (una escala, una unidad). Más de una serie muestra leyenda. */
export function ColumnsChart({ title, description, data, series, unit = "count", height = 240, empty = "Sin datos en el periodo" }: Props) {
  const hasData = data.some((d) => series.some((s) => Number(d[s.key] ?? 0) > 0));
  return (
    <ChartCard title={title} description={description} table={tableOf(data, series, unit, "Periodo")} bodyClassName="space-y-2">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
      {!hasData ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title}: ${series.map((s) => s.label).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} minTickGap={16} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} width={unit === "count" ? 36 : 56} tickFormatter={(v: number) => fmt(v, unit)} />
              <Tooltip
                cursor={{ fill: "rgba(100,116,139,0.08)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? <ChartTooltipBox title={String(label)} rows={series.map((s) => ({ color: s.color, label: s.label, value: fmt(Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0), unit) }))} /> : null
                }
              />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={36} stroke="#fff" strokeWidth={series.length > 1 ? 1 : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/** Área de una sola serie (evolución). */
export function AreaTrend({ title, description, data, series, unit = "count", height = 240 }: Props) {
  const s = series[0];
  const gid = `fill-${s.key}`;
  return (
    <ChartCard title={title} description={description} table={tableOf(data, [s], unit, "Periodo")}>
      <div style={{ height }} role="img" aria-label={`${title}: ${s.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} minTickGap={24} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: AXIS, fontSize: 11 }} width={unit === "count" ? 36 : 56} tickFormatter={(v: number) => fmt(v, unit)} />
            <Tooltip cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} content={({ active, payload, label }) => (active && payload?.length ? <ChartTooltipBox title={String(label)} rows={[{ color: s.color, label: s.label, value: fmt(Number(payload[0].value), unit) }]} /> : null)} />
            <Area type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 4, fill: s.color, stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
