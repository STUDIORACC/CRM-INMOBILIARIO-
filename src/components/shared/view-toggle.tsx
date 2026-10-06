"use client";

import { useUrlParams } from "@/hooks/use-url-params";
import { cn } from "@/lib/utils";

/** Alterna entre vistas (tablero/tabla, agenda/tabla, cuadrícula/tabla) guardando la elección en la URL. */
export function ViewToggle({ param, value, options }: { param: string; value: string; options: Array<{ value: string; label: string; icon?: React.ReactNode }> }) {
  const { update } = useUrlParams();
  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-card" role="group" aria-label="Vista">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => update({ [param]: o.value }, { resetPage: false })}
          className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors", value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
        >
          {o.icon}
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
