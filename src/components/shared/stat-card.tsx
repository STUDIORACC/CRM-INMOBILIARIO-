import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface Delta {
  /** Variación porcentual contra el periodo anterior (null = sin base de comparación). */
  value: number | null;
  /** Cuando bajar es bueno (p. ej. tiempo de cierre). */
  inverse?: boolean;
  label?: string;
}

function DeltaPill({ delta }: { delta: Delta }) {
  if (delta.value == null || !Number.isFinite(delta.value)) {
    return <span className="text-xs text-muted-foreground">{delta.label ?? "Sin comparativo"}</span>;
  }
  const v = delta.value;
  const flat = Math.abs(v) < 0.5;
  const good = delta.inverse ? v < 0 : v > 0;
  const Icon = flat ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular",
          flat ? "bg-muted text-muted-foreground" : good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
        )}
      >
        <Icon className="size-3" />
        {Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1)}%
      </span>
      <span className="text-muted-foreground">{delta.label ?? "vs. periodo anterior"}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  delta,
  icon,
  href,
  info,
  accent = "text-primary bg-primary/10",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: Delta;
  icon?: React.ReactNode;
  href?: string;
  info?: string;
  accent?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors",
        href && "hover:border-primary/40 hover:bg-accent/30",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
          {label}
          {info && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 cursor-help text-muted-foreground/70" aria-label="Cómo se calcula" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{info}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {icon && <span className={cn("flex size-8 items-center justify-center rounded-lg", accent)}>{icon}</span>}
      </div>
      <div>
        <div className="text-[1.65rem] font-semibold leading-none tracking-tight tabular">{value}</div>
        <div className="mt-2 min-h-5">{delta ? <DeltaPill delta={delta} /> : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}</div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}
