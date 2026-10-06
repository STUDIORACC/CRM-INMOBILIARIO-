"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";
import { useLookups } from "@/components/providers/app-context";
import { OptBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AUDIT_ENTITIES, AUDIT_EVENTS } from "@/lib/domain/constants";
import { describeChanges, describeSnapshot, type AuditCtx } from "@/lib/domain/audit";
import { dayLabel, fmtDate, fmtDateTimeFull, fmtTime } from "@/lib/domain/dates";
import type { AuditRow } from "@/lib/services/audit";
import { cn } from "@/lib/utils";

export function AuditView({ rows }: { rows: AuditRow[] }) {
  const lookups = useLookups();
  const ctx: AuditCtx = useMemo(
    () => ({ userName: lookups.userName, stageLabel: lookups.stageLabel, source: lookups.source, district: lookups.district, propertyType: lookups.propertyType, lossReason: lookups.lossReason }),
    [lookups],
  );
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState icon={<ShieldCheck className="size-5" />} title="Sin registros de auditoría" description="No hay cambios con estos filtros." />
      </div>
    );
  }
  return (
    <ul className="divide-y rounded-xl border bg-card shadow-card">
      {rows.map((r) => (
        <AuditEntry key={r.id} row={r} ctx={ctx} />
      ))}
    </ul>
  );
}

function AuditEntry({ row: r, ctx }: { row: AuditRow; ctx: AuditCtx }) {
  const [open, setOpen] = useState(false);
  const entity = AUDIT_ENTITIES.find((e) => e.value === r.entity_type);
  const href = entity?.href && r.entity_id && r.action !== "delete" ? entity.href(r.entity_id) : null;
  const lines = useMemo(() => describeChanges(r.changes, r.entity_type, ctx), [r.changes, r.entity_type, ctx]);
  const snapshot = useMemo(() => (r.action === "delete" ? describeSnapshot(r.changes, r.entity_type, ctx) : []), [r.action, r.changes, r.entity_type, ctx]);
  const expandable = lines.length > 0 || snapshot.length > 0;
  const preview = lines.slice(0, 2);
  const label = r.entity_label ?? "(sin nombre)";

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <UserAvatar name={r.actor ?? "Sistema"} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{r.actor ?? "Sistema"}</span>
            <OptBadge list={AUDIT_EVENTS} value={r.event} />
            <span className="text-muted-foreground">{entity?.label ?? r.entity_type}</span>
            {href ? (
              <Link href={href} className="font-medium text-primary hover:underline">
                {label}
              </Link>
            ) : (
              <span className="font-medium">{label}</span>
            )}
          </div>
          {preview.length > 0 && !open && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {preview.map((l) => (
                <li key={l.field} className="flex flex-wrap items-center gap-1">
                  <span className="font-medium text-foreground/80">{l.label}:</span>
                  <span className="max-w-[16rem] truncate line-through decoration-muted-foreground/40">{l.from}</span>
                  <ArrowRight className="size-3" />
                  <span className="max-w-[16rem] truncate text-foreground">{l.to}</span>
                </li>
              ))}
              {lines.length > preview.length && <li className="text-[11px]">y {lines.length - preview.length} cambio{lines.length - preview.length === 1 ? "" : "s"} más</li>}
            </ul>
          )}
          {open && lines.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Campo</th>
                    <th className="px-3 py-1.5 font-medium">Antes</th>
                    <th className="px-3 py-1.5 font-medium">Después</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l) => (
                    <tr key={l.field}>
                      <td className="px-3 py-1.5 font-medium">{l.label}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{l.from}</td>
                      <td className="px-3 py-1.5">{l.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {open && snapshot.length > 0 && (
            <dl className="mt-2 grid gap-x-6 gap-y-1 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-2">
              {snapshot.map((s) => (
                <div key={s.label} className="flex gap-2">
                  <dt className="shrink-0 font-medium">{s.label}:</dt>
                  <dd className="min-w-0 truncate text-muted-foreground">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {r.action === "create" && <p className="mt-0.5 text-xs text-muted-foreground">Registro creado.</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <time dateTime={r.created_at} title={fmtDateTimeFull(r.created_at)} className="text-xs text-muted-foreground tabular">
            {dayLabel(r.created_at) === "Hoy" || dayLabel(r.created_at) === "Ayer" ? dayLabel(r.created_at) : fmtDate(r.created_at)} · {fmtTime(r.created_at)}
          </time>
          {expandable && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              {open ? "Ocultar" : r.action === "delete" ? "Ver datos" : "Ver detalle"}
              <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
