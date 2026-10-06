"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlParams } from "@/hooks/use-url-params";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export type FilterDef =
  | { type: "search"; key: string; placeholder: string }
  | { type: "select"; key: string; label: string; options: FilterOption[] }
  | { type: "multi"; key: string; label: string; options: FilterOption[] }
  | { type: "daterange"; fromKey: string; toKey: string; label: string }
  | { type: "numrange"; minKey: string; maxKey: string; label: string; prefix?: string };

const ALL = "__all__";

function keysOf(f: FilterDef): string[] {
  if (f.type === "daterange") return [f.fromKey, f.toKey];
  if (f.type === "numrange") return [f.minKey, f.maxKey];
  return [f.key];
}

export function FilterBar({ filters, extraKeys = [], children, className }: { filters: FilterDef[]; extraKeys?: string[]; children?: React.ReactNode; className?: string }) {
  const { sp, update, clear, pending } = useUrlParams();
  const [open, setOpen] = useState(false);
  const search = filters.find((f): f is Extract<FilterDef, { type: "search" }> => f.type === "search");
  const others = filters.filter((f) => f.type !== "search");

  const allKeys = [...filters.flatMap(keysOf), ...extraKeys];
  const active = others.filter((f) => keysOf(f).some((k) => sp.get(k))).length;
  const hasAny = allKeys.some((k) => sp.get(k));

  return (
    <div className={cn("mb-4 rounded-xl border bg-card p-3 shadow-card", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {search && <SearchBox def={search} />}
        {others.length > 0 && (
          <Button variant="outline" className="md:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <SlidersHorizontal />
            Filtros{active > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{active}</span>}
          </Button>
        )}
        <div className={cn("w-full flex-wrap items-center gap-2 md:flex md:w-auto", open ? "flex" : "hidden")}>
          {others.map((f) => {
            if (f.type === "select") return <SelectFilter key={f.key} def={f} value={sp.get(f.key) ?? ""} onChange={(v) => update({ [f.key]: v })} />;
            if (f.type === "multi") return <MultiFilter key={f.key} def={f} value={sp.get(f.key) ?? ""} onChange={(v) => update({ [f.key]: v })} />;
            if (f.type === "daterange")
              return <DateRangeFilter key={f.fromKey} def={f} from={sp.get(f.fromKey) ?? ""} to={sp.get(f.toKey) ?? ""} onChange={(from, to) => update({ [f.fromKey]: from, [f.toKey]: to })} />;
            if (f.type === "numrange") return <NumRangeFilter key={f.minKey} def={f} min={sp.get(f.minKey) ?? ""} max={sp.get(f.maxKey) ?? ""} onChange={(a, b) => update({ [f.minKey]: a, [f.maxKey]: b })} />;
            return null;
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pending && <span className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-label="Actualizando" />}
          {hasAny && (
            <Button variant="ghost" size="sm" onClick={() => clear(allKeys)}>
              <X />
              Limpiar filtros
            </Button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function SearchBox({ def }: { def: Extract<FilterDef, { type: "search" }> }) {
  const { sp, update } = useUrlParams();
  const urlValue = sp.get(def.key) ?? "";
  const [value, setValue] = useState(urlValue);
  const first = useRef(true);

  // Sincroniza cuando la URL cambia desde fuera (p. ej. "Limpiar filtros")
  const [syncedUrl, setSyncedUrl] = useState(urlValue);
  if (syncedUrl !== urlValue) {
    setSyncedUrl(urlValue);
    setValue(urlValue);
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (value === urlValue) return;
    const id = setTimeout(() => update({ [def.key]: value.trim() || null }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative min-w-[200px] flex-1 md:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={def.placeholder} className="pl-9" aria-label={def.placeholder} />
      {value && (
        <button type="button" onClick={() => setValue("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Borrar búsqueda">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function SelectFilter({ def, value, onChange }: { def: Extract<FilterDef, { type: "select" }>; value: string; onChange: (v: string | null) => void }) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger className={cn("w-full md:w-auto md:min-w-[140px]", value && "border-primary/50 bg-primary/5")} aria-label={def.label}>
        <span className="text-muted-foreground">{def.label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todos</SelectItem>
        {def.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiFilter({ def, value, onChange }: { def: Extract<FilterDef, { type: "multi" }>; value: string; onChange: (v: string | null) => void }) {
  const selected = value ? value.split(",") : [];
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
    onChange(next.length ? next.join(",") : null);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full justify-between md:w-auto", selected.length > 0 && "border-primary/50 bg-primary/5")}>
          <span className="text-muted-foreground">{def.label}:</span>
          <span>{selected.length === 0 ? "Todos" : selected.length === 1 ? (def.options.find((o) => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} seleccionados`}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-60 overflow-y-auto p-1.5">
        {def.options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange(null)}>
            Limpiar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DateRangeFilter({ def, from, to, onChange }: { def: Extract<FilterDef, { type: "daterange" }>; from: string; to: string; onChange: (from: string | null, to: string | null) => void }) {
  const label = from || to ? `${from || "…"} → ${to || "…"}` : "Cualquiera";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full justify-between md:w-auto", (from || to) && "border-primary/50 bg-primary/5")}>
          <CalendarRange className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">{def.label}:</span>
          <span className="tabular">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Desde
            <Input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value || null, to || null)} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Hasta
            <Input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from || null, e.target.value || null)} />
          </label>
        </div>
        {(from || to) && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(null, null)}>
            Quitar fechas
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NumRangeFilter({ def, min, max, onChange }: { def: Extract<FilterDef, { type: "numrange" }>; min: string; max: string; onChange: (min: string | null, max: string | null) => void }) {
  const [a, setA] = useState(min);
  const [b, setB] = useState(max);
  const [synced, setSynced] = useState({ min, max });
  if (synced.min !== min || synced.max !== max) {
    setSynced({ min, max });
    setA(min);
    setB(max);
  }
  const fmt = (v: string) => (v ? Number(v).toLocaleString("en-US") : "…");
  const label = min || max ? `${def.prefix ?? ""}${fmt(min)} – ${def.prefix ?? ""}${fmt(max)}` : "Cualquiera";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full justify-between md:w-auto", (min || max) && "border-primary/50 bg-primary/5")}>
          <span className="text-muted-foreground">{def.label}:</span>
          <span className="tabular">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Mínimo
            <Input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/D/g, ""))} placeholder="0" />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Máximo
            <Input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/D/g, ""))} placeholder="Sin límite" />
          </label>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => onChange(a || null, b || null)}>
            Aplicar
          </Button>
          {(min || max) && (
            <Button variant="ghost" onClick={() => onChange(null, null)}>
              Quitar
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
