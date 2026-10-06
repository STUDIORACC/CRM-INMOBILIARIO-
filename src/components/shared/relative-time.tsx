"use client";

import { fmtDateTimeFull, fmtRelative } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

/** Fecha relativa con el valor exacto en el tooltip nativo. */
export function RelativeTime({ value, className, fallback = "—" }: { value: string | null | undefined; className?: string; fallback?: string }) {
  if (!value) return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  return (
    <time dateTime={value} title={fmtDateTimeFull(value)} suppressHydrationWarning className={className}>
      {fmtRelative(value)}
    </time>
  );
}
