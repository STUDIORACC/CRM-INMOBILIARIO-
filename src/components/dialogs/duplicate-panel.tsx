"use client";

import { AlertTriangle, ExternalLink, GitMerge, Loader2 } from "lucide-react";
import { LeadStageBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/domain/phone";
import type { DuplicateMatch } from "@/lib/services/leads";

/** Resolución de posibles duplicados: revisar, fusionar, crear igualmente o cancelar. */
export function DuplicatePanel({
  matches,
  busy,
  onMerge,
  onCreate,
  onCancel,
  entityLabel = "lead",
}: {
  matches: DuplicateMatch[];
  busy: boolean;
  onMerge?: (m: DuplicateMatch) => void;
  onCreate: () => void;
  onCancel: () => void;
  entityLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="size-5" />
        </span>
        <div>
          <h3 className="font-semibold text-amber-900">Posible {entityLabel} duplicado</h3>
          <p className="mt-0.5 text-sm text-amber-900/80">Encontramos registros con el mismo teléfono o correo. Revísalos antes de crear uno nuevo para no duplicar el trabajo.</p>
        </div>
      </div>
      <ul className="space-y-2">
        {matches.map((m) => (
          <li key={`${m.kind}-${m.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold">{m.full_name}</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">{m.kind === "lead" ? "Lead" : "Cliente"}</span>
                {m.kind === "lead" && <LeadStageBadge value={m.stage} />}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {m.phone ? formatPhone(m.phone) : "—"} · {m.email ?? "sin email"} · {m.assigned_name ? `Vendedor: ${m.assigned_name}` : "Sin vendedor"}
                <span className="ml-1 text-amber-700">({m.phone_match && m.email_match ? "mismo teléfono y correo" : m.phone_match ? "mismo teléfono" : "mismo correo"})</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={m.kind === "lead" ? `/leads/${m.id}` : `/clients/${m.id}`} target="_blank" rel="noreferrer">
                  <ExternalLink /> Revisar
                </a>
              </Button>
              {onMerge && (
                <Button size="sm" disabled={busy} onClick={() => onMerge(m)}>
                  <GitMerge /> Fusionar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {onMerge && (
        <p className="text-xs text-muted-foreground">
          <b>Fusionar</b> agrega esta consulta al registro existente (completa los datos faltantes y deja una nota en su historial) sin crear un {entityLabel} nuevo.
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar creación
        </Button>
        <Button variant="outline" onClick={onCreate} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Crear de todos modos
        </Button>
      </div>
    </div>
  );
}
