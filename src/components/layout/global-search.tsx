"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Building2, CheckSquare, KeyRound, Loader2, Search, Target, UserCheck, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { SearchHit, SearchKind } from "@/lib/services/search";

const META: Record<SearchKind, { label: string; icon: LucideIcon; tone: string }> = {
  lead: { label: "Leads", icon: Users, tone: "bg-indigo-50 text-indigo-600" },
  client: { label: "Clientes", icon: UserCheck, tone: "bg-sky-50 text-sky-600" },
  opportunity: { label: "Oportunidades", icon: Target, tone: "bg-violet-50 text-violet-600" },
  property: { label: "Propiedades", icon: Building2, tone: "bg-emerald-50 text-emerald-600" },
  owner: { label: "Propietarios", icon: KeyRound, tone: "bg-amber-50 text-amber-600" },
  activity: { label: "Actividades", icon: Activity, tone: "bg-slate-100 text-slate-600" },
  task: { label: "Tareas", icon: CheckSquare, tone: "bg-teal-50 text-teal-600" },
};
const ORDER: SearchKind[] = ["lead", "client", "opportunity", "property", "owner", "activity", "task"];

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const [result, setResult] = useState<{ q: string; hits: SearchHit[] } | null>(null);
  const q = debounced.trim();
  const searchable = open && q.length >= 2;
  // Mientras llega la respuesta se muestran los resultados anteriores; al borrar el texto se vacían
  const hits = q.length >= 2 ? (result?.hits ?? []) : [];
  const loading = searchable && result?.q !== q;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!searchable) return;
    const ctl = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { hits: SearchHit[] }) => setResult({ q, hits: d.hits }))
      .catch(() => {
        if (!ctl.signal.aborted) setResult({ q, hits: [] });
      });
    return () => ctl.abort();
  }, [q, searchable]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const grouped = ORDER.map((k) => ({ kind: k, items: hits.filter((h) => h.kind === k) })).filter((g) => g.items.length > 0);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="hidden h-9 w-full max-w-md justify-start gap-2 bg-muted/50 font-normal text-muted-foreground hover:bg-muted md:flex" aria-label="Búsqueda global">
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar leads, clientes, propiedades…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Buscar">
        <Search className="size-[18px]" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Búsqueda global" description="Busca por nombre, teléfono, email, código de propiedad, dirección o propietario">
        <CommandInput placeholder="Nombre, teléfono, email, código (SM-024), dirección…" value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[60dvh]">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Buscando…
            </div>
          )}
          {!loading && debounced.trim().length < 2 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Escribe al menos 2 caracteres. Prueba con un nombre, un teléfono o un código como <b>SM-024</b>.</div>}
          {!loading && debounced.trim().length >= 2 && hits.length === 0 && <CommandEmpty>No encontramos resultados para “{debounced}”.</CommandEmpty>}
          {grouped.map((g) => {
            const meta = META[g.kind];
            const Icon = meta.icon;
            return (
              <CommandGroup key={g.kind} heading={meta.label}>
                {g.items.map((h) => (
                  <CommandItem key={`${h.kind}-${h.id}`} value={`${h.kind}-${h.id}`} onSelect={() => go(h.href)} className="gap-3 py-2">
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{h.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span>
                    </span>
                    {h.badge && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{h.badge}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
