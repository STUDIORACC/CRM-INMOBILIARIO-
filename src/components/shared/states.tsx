import Link from "next/link";
import { AlertTriangle, Inbox, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "No pudimos cargar esta información", description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description ?? "Inténtalo de nuevo en unos segundos. Si el problema persiste, contacta al administrador."}</p>
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function NoAccess({ message }: { message?: string }) {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-2xl border bg-card px-8 py-12 text-center shadow-card">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Lock className="size-5" />
      </div>
      <h2 className="text-lg font-semibold">Acceso restringido</h2>
      <p className="mt-1 text-sm text-muted-foreground">{message ?? "Tu rol no tiene permisos para ver esta sección. Si necesitas acceso, solicítalo al administrador."}</p>
      <Button asChild className="mt-5">
        <Link href="/dashboard">Volver al dashboard</Link>
      </Button>
    </div>
  );
}
