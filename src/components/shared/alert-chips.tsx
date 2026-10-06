"use client";

import { AlertTriangle } from "lucide-react";
import { useUrlParams } from "@/hooks/use-url-params";
import { cn } from "@/lib/utils";

export interface AlertChip {
  key: string;
  label: string;
  count: number;
  severity?: "danger" | "warning" | "info";
}

/** Chips de alertas accionables que filtran la lista (?alert=clave). */
export function AlertChips({ chips, param = "alert" }: { chips: AlertChip[]; param?: string }) {
  const { sp, update } = useUrlParams();
  const active = sp.get(param);
  const visible = chips.filter((c) => c.count > 0 || c.key === active);
  if (visible.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Alertas">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <AlertTriangle className="size-3.5" /> Alertas
      </span>
      {visible.map((c) => {
        const on = active === c.key;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => update({ [param]: on ? null : c.key })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : c.severity === "danger"
                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : c.severity === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {c.label}
            <span className={cn("rounded-full px-1.5 text-[11px] tabular", on ? "bg-white/25" : "bg-white/70")}>{c.count}</span>
          </button>
        );
      })}
    </div>
  );
}
