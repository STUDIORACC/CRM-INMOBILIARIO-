import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tarjeta de sección con título y enlace "Ver todo". */
export function Panel({
  title,
  description,
  href,
  hrefLabel = "Ver todo",
  action,
  children,
  className,
  bodyClassName,
  count,
}: {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  count?: number;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card shadow-card", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-1">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {title}
            {count != null && count > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular">{count}</span>}
          </h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {href && (
            <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              {hrefLabel}
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>
      </header>
      <div className={cn("flex-1 px-5 pt-2 pb-4", bodyClassName)}>{children}</div>
    </section>
  );
}
