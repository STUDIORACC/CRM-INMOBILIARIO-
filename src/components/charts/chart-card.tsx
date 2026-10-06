"use client";

import { useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface TableView {
  headers: string[];
  rows: Array<Array<string | number>>;
}

/** Tarjeta contenedora de un gráfico con vista de tabla alternativa (accesibilidad). */
export function ChartCard({
  title,
  description,
  children,
  table,
  actions,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  table?: TableView;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card shadow-card", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {table && (
            <Button variant="ghost" size="icon-sm" onClick={() => setAsTable((v) => !v)} aria-label={asTable ? "Ver gráfico" : "Ver como tabla"} title={asTable ? "Ver gráfico" : "Ver como tabla"}>
              {asTable ? <BarChart3 /> : <Table2 />}
            </Button>
          )}
        </div>
      </header>
      <div className={cn("flex-1 px-5 pt-3 pb-4", bodyClassName)}>
        {asTable && table ? (
          <div className="max-h-72 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {table.headers.map((h, i) => (
                    <TableHead key={h} className={cn("text-xs", i > 0 && "text-right")}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((r, i) => (
                  <TableRow key={i}>
                    {r.map((c, j) => (
                      <TableCell key={j} className={cn("py-1.5 text-sm tabular", j > 0 && "text-right")}>
                        {c}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function ChartTooltipBox({ title, rows }: { title?: string; rows: Array<{ color?: string; label: string; value: React.ReactNode }> }) {
  return (
    <div className="min-w-32 rounded-lg border bg-popover px-3 py-2 text-xs shadow-pop">
      {title && <div className="mb-1.5 font-medium text-foreground">{title}</div>}
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && <span className="size-2 rounded-[3px]" style={{ backgroundColor: r.color }} />}
              {r.label}
            </span>
            <span className="font-medium tabular text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
