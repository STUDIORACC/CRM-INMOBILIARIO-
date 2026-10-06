import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto genérico mientras carga cualquier pantalla del CRM. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Cargando">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-xl" />
      <div className="space-y-2.5 rounded-xl border bg-card p-4 shadow-card">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
