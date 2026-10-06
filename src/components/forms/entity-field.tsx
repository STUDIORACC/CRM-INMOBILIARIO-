"use client";

import { Building2, Check, ChevronsUpDown, Loader2, User, UserRound, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { FieldShell } from "./fields";

export type LookupKind = "lead" | "client" | "party" | "property" | "owner";

export interface LookupItem {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  meta?: Record<string, string | number | null>;
}

const ICONS: Record<LookupKind, typeof User> = { lead: UserRound, client: Users, party: User, property: Building2, owner: User };
const PLACEHOLDER: Record<LookupKind, string> = {
  lead: "Buscar lead por nombre o teléfono…",
  client: "Buscar cliente por nombre o teléfono…",
  party: "Buscar lead o cliente…",
  property: "Buscar propiedad por código o título…",
  owner: "Buscar propietario…",
};

async function fetchLookup(kind: LookupKind, params: Record<string, string | undefined>, signal?: AbortSignal): Promise<LookupItem[]> {
  const sp = new URLSearchParams({ kind });
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const res = await fetch(`/api/lookup?${sp.toString()}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { items: LookupItem[] };
  return json.items;
}

/**
 * Selector asíncrono de registros (leads, clientes, propiedades, propietarios).
 * Guarda solo el id en el formulario; el texto visible se resuelve por la API.
 */
export function EntityField({
  name,
  label,
  kind,
  required,
  hint,
  initialLabel,
  filters,
  placeholder,
  className,
  disabled,
  onSelect,
}: {
  name: string;
  label?: string;
  kind: LookupKind;
  required?: boolean;
  hint?: string;
  initialLabel?: string;
  filters?: Record<string, string | undefined>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onSelect?: (item: LookupItem | null) => void;
}) {
  const { control } = useFormContext();
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <EntityCombobox
            id={`f-${name}`}
            kind={kind}
            value={(field.value as string) || ""}
            onChange={(id, item) => {
              field.onChange(id);
              onSelect?.(item);
            }}
            initialLabel={initialLabel}
            filters={filters}
            placeholder={placeholder}
            disabled={disabled}
          />
        )}
      />
    </FieldShell>
  );
}

export function EntityCombobox({
  id,
  kind,
  value,
  onChange,
  initialLabel,
  filters,
  placeholder,
  disabled,
  allowClear = true,
}: {
  id?: string;
  kind: LookupKind;
  value: string;
  onChange: (id: string, item: LookupItem | null) => void;
  initialLabel?: string;
  filters?: Record<string, string | undefined>;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const [found, setFound] = useState<{ key: string; items: LookupItem[] } | null>(null);
  const [resolvedLabel, setSelectedLabel] = useState<string | null>(initialLabel ?? null);
  // Sin valor seleccionado no hay etiqueta que mostrar
  const selectedLabel = value ? resolvedLabel : null;
  const filtersKey = JSON.stringify(filters ?? {});
  const searchKey = `${kind}|${debounced}|${filtersKey}`;
  const items = found?.items ?? [];
  const loading = open && found?.key !== searchKey;
  const resolved = useRef<string>("");
  const Icon = ICONS[kind];

  // Resuelve la etiqueta de un valor preexistente
  useEffect(() => {
    if (!value) return;
    if (selectedLabel || resolved.current === value) return;
    resolved.current = value;
    fetchLookup(kind, { id: value }).then((r) => r[0] && setSelectedLabel(r[0].label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, kind]);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    fetchLookup(kind, { q: debounced, ...(filters ?? {}) }, ctl.signal)
      .then((r) => setFound({ key: searchKey, items: r }))
      .catch(() => {
        if (!ctl.signal.aborted) setFound({ key: searchKey, items: [] });
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debounced, kind, filtersKey]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" id={id} variant="outline" disabled={disabled} role="combobox" aria-expanded={open} className="w-full justify-between bg-white font-normal">
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>{selectedLabel ?? placeholder ?? PLACEHOLDER[kind]}</span>
          </span>
          <span className="flex items-center gap-1">
            {value && allowClear && !disabled && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Quitar selección"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedLabel(null);
                  onChange("", null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    setSelectedLabel(null);
                    onChange("", null);
                  }
                }}
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder ?? PLACEHOLDER[kind]} value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Buscando…
              </div>
            )}
            {!loading && items.length === 0 && <CommandEmpty>Sin resultados.</CommandEmpty>}
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.id}
                  value={it.id}
                  onSelect={() => {
                    setSelectedLabel(it.label);
                    onChange(it.id, it);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{it.label}</div>
                    {it.sublabel && <div className="truncate text-xs text-muted-foreground">{it.sublabel}</div>}
                  </div>
                  {it.badge && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{it.badge}</span>}
                  {value === it.id && <Check className="size-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
