import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-6xl font-semibold text-primary">404</p>
      <h1 className="text-xl font-semibold">Esta página no existe</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Puede que el enlace esté desactualizado. Vuelve al CRM para continuar.</p>
      <Button asChild>
        <Link href="/dashboard">Ir al CRM</Link>
      </Button>
    </main>
  );
}
