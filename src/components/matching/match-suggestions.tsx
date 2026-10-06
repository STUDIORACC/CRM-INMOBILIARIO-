"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bath, BedDouble, CalendarPlus, Check, Eye, Loader2, Minus, Ruler, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { getMatchesAction, saveMatchAction } from "@/actions/matching";
import { useLookups } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { PropertyImage } from "@/components/shared/property-image";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/domain/money";
import type { MatchedProperty } from "@/lib/services/matching";
import { cn } from "@/lib/utils";

type Picked = Pick<MatchedProperty, "id" | "code" | "title" | "price" | "currency" | "operation">;

export function ScorePill({ score, className }: { score: number; className?: string }) {
  const tone = score >= 85 ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : score >= 70 ? "bg-teal-50 text-teal-700 ring-teal-600/20" : score >= 55 ? "bg-amber-50 text-amber-800 ring-amber-600/25" : "bg-slate-100 text-slate-600 ring-slate-500/20";
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset tabular", tone, className)}>{score}% compatible</span>;
}

function Reason({ r }: { r: MatchedProperty["reasons"][number] }) {
  const Icon = r.status === "match" ? Check : r.status === "partial" ? Minus : X;
  const tone = r.status === "match" ? "bg-emerald-100 text-emerald-700" : r.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon className="size-2.5" strokeWidth={3} />
      </span>
      <span>
        <b className="font-medium">{r.label}:</b> <span className="text-muted-foreground">{r.detail}</span>
      </span>
    </li>
  );
}

/** Propiedades compatibles con la búsqueda de un lead/cliente, con el porcentaje y el porqué. */
export function MatchSuggestions({
  leadId,
  clientId,
  compact = false,
  onPick,
  limit,
}: {
  leadId?: string;
  clientId?: string;
  compact?: boolean;
  onPick?: (p: Picked) => void;
  limit?: number;
}) {
  const lookups = useLookups();
  const { open } = useQuickActions();
  const [state, setState] = useState<{ loading: boolean; error?: string; empty?: boolean; matches: MatchedProperty[] }>({ loading: true, matches: [] });

  const fetchMatches = useCallback(async (): Promise<typeof state> => {
    const res = await getMatchesAction({ leadId, clientId, limit: limit ?? (compact ? 4 : 10) });
    return res.ok ? { loading: false, empty: res.data.profileEmpty, matches: res.data.matches } : { loading: false, error: res.error, matches: [] };
  }, [leadId, clientId, compact, limit]);

  // Carga inicial (y cuando cambia el lead/cliente): el estado solo se actualiza al llegar la respuesta
  useEffect(() => {
    let alive = true;
    void fetchMatches().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [fetchMatches]);

  const reload = async () => {
    setState((s) => ({ ...s, loading: true }));
    setState(await fetchMatches());
  };

  const save = async (m: MatchedProperty, status: "sent" | "discarded") => {
    const res = await saveMatchAction({ propertyId: m.id, leadId, clientId, status, score: m.score, reasons: m.reasons });
    if (!res.ok) return toast.error(res.error);
    toast.success(status === "sent" ? "Marcada como enviada y registrada en el historial" : "Propiedad descartada para este cliente");
    void reload();
  };

  if (state.loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Buscando propiedades compatibles…
      </div>
    );
  }
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>;
  if (state.empty) {
    return <EmptyState compact icon={<Sparkles className="size-5" />} title="Completa la calificación para ver coincidencias" description="Define operación, presupuesto, distritos y características en la ficha para sugerir propiedades automáticamente." />;
  }
  const visible = state.matches.filter((m) => m.saved !== "discarded");
  if (visible.length === 0) {
    return <EmptyState compact icon={<Sparkles className="size-5" />} title="No hay propiedades compatibles ahora" description="Ninguna propiedad disponible supera el 45% de coincidencia con esta búsqueda." />;
  }

  if (compact) {
    return (
      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" /> Propiedades compatibles con su búsqueda
        </div>
        <ul className="space-y-1.5">
          {visible.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onPick?.(m)} className="flex w-full items-center gap-3 rounded-lg border bg-card p-2 text-left transition-colors hover:border-primary/50">
                <PropertyImage src={m.image} alt={m.title} className="size-11 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {m.code} · {m.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {lookups.district(m.district)} · {formatMoney(m.price, m.currency)}
                    {m.operation === "rent" ? "/mes" : ""}
                  </span>
                </span>
                <ScorePill score={m.score} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {visible.map((m) => (
        <li key={m.id} className="overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="flex flex-col gap-4 p-3.5 sm:flex-row">
            <Link href={`/properties/${m.id}`} className="shrink-0">
              <PropertyImage src={m.image} alt={m.title} className="h-32 w-full rounded-lg sm:h-28 sm:w-40" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/properties/${m.id}`} className="block truncate text-sm font-semibold hover:text-primary">
                    {m.code} · {m.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {lookups.district(m.district)} · {lookups.propertyType(m.propertyType)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <ScorePill score={m.score} />
                  {m.saved === "sent" && <span className="text-[11px] font-medium text-emerald-700">✓ Ya enviada</span>}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="text-sm font-semibold text-foreground">
                  {formatMoney(m.price, m.currency)}
                  {m.operation === "rent" ? "/mes" : ""}
                </span>
                {m.bedrooms != null && (
                  <span className="inline-flex items-center gap-1">
                    <BedDouble className="size-3.5" /> {m.bedrooms}
                  </span>
                )}
                {m.bathrooms != null && (
                  <span className="inline-flex items-center gap-1">
                    <Bath className="size-3.5" /> {m.bathrooms}
                  </span>
                )}
                {m.area != null && (
                  <span className="inline-flex items-center gap-1">
                    <Ruler className="size-3.5" /> {m.area} m²
                  </span>
                )}
              </div>
              <ul className="mt-2.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {m.reasons.map((r) => (
                  <Reason key={r.key} r={r} />
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t bg-muted/30 px-3.5 py-2">
            {onPick && (
              <Button size="sm" onClick={() => onPick(m)}>
                Elegir
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => save(m, "sent")} disabled={m.saved === "sent"}>
              <Send /> {m.saved === "sent" ? "Enviada" : "Marcar como enviada"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => open("visit", { leadId, clientId, propertyId: m.id, propertyLabel: `${m.code} · ${m.title}` })}>
              <CalendarPlus /> Agendar visita
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/properties/${m.id}`}>
                <Eye /> Ver ficha
              </Link>
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => save(m, "discarded")}>
              Descartar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
