"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

/** Falla inesperada en una pantalla: se informa sin exponer detalles técnicos y se permite reintentar. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] error de pantalla:", error);
  }, [error]);
  return (
    <div className="mx-auto mt-10 max-w-xl space-y-3">
      <ErrorState onRetry={reset} />
      <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
        {error.digest && <span>Código de referencia: {error.digest}</span>}
        <Button variant="link" asChild className="h-auto p-0">
          <Link href="/dashboard">Ir al dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
