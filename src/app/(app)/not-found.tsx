import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-2xl border bg-card px-8 py-12 text-center shadow-card">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-5" />
      </div>
      <h2 className="text-lg font-semibold">No encontramos lo que buscas</h2>
      <p className="mt-1 text-sm text-muted-foreground">El registro no existe, fue eliminado o no tienes acceso a él. Revisa el enlace o usa la búsqueda global (Ctrl + K).</p>
      <div className="mt-5 flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Volver al dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/leads">Ver leads</Link>
        </Button>
      </div>
    </div>
  );
}
