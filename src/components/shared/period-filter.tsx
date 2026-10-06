"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUrlParams } from "@/hooks/use-url-params";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

/** Selector de periodo (Hoy, 7 días, mes…, personalizado) sincronizado con la URL. */
export function PeriodFilter({
  options,
  value,
  from,
  to,
  className,
}: {
  options: PeriodKey[];
  value: PeriodKey;
  from: string;
  to: string;
  className?: string;
}) {
  const { update, pending } = useUrlParams();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const preset = options.filter((o) => o !== "custom");

  return (
    <div className={cn("flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-card scrollbar-none", pending && "opacity-70", className)} role="group" aria-label="Periodo">
      {preset.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => update({ period: o, from: null, to: null })}
          aria-pressed={value === o}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
            value === o ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {PERIOD_LABELS[o]}
        </button>
      ))}
      {options.includes("custom") && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-pressed={value === "custom"}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                value === "custom" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <CalendarRange className="size-3.5" />
              {value === "custom" ? `${from} → ${to}` : "Personalizado"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Desde
                <Input type="date" value={f} max={t || undefined} onChange={(e) => setF(e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                Hasta
                <Input type="date" value={t} min={f || undefined} onChange={(e) => setT(e.target.value)} />
              </label>
            </div>
            <Button
              className="w-full"
              disabled={!f || !t || f > t}
              onClick={() => {
                update({ period: "custom", from: f, to: t });
                setOpen(false);
              }}
            >
              Aplicar rango
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
