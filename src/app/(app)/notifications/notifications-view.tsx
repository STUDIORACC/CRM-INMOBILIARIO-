"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteNotificationsAction, markNotificationsReadAction } from "@/actions/notifications";
import { NOTIFICATION_ICONS } from "@/components/layout/notification-bell";
import { EmptyState } from "@/components/shared/states";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useUrlParams } from "@/hooks/use-url-params";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/domain/notification-types";
import type { NotificationRow } from "@/lib/services/notifications";
import { cn } from "@/lib/utils";

export function NotificationsView({ items, unread, view, type, total }: { items: NotificationRow[]; unread: number; view: "all" | "unread"; type: string; total: number }) {
  const router = useRouter();
  const { update, pending } = useUrlParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, start] = useTransition();

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, ok?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "No se pudo completar la acción");
      else {
        if (ok) toast.success(ok);
        setSelected(new Set());
        router.refresh();
      }
    });

  const open = (n: NotificationRow) => {
    if (!n.read_at) void markNotificationsReadAction({ ids: [n.id] });
    if (n.href) router.push(n.href);
    else router.refresh();
  };

  return (
    <div className={cn("space-y-4", (pending || busy) && "opacity-70 transition-opacity")}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-card" role="group" aria-label="Filtrar notificaciones">
          {[
            { v: "all", label: "Todas" },
            { v: "unread", label: `Sin leer${unread ? ` (${unread})` : ""}` },
          ].map((o) => (
            <button key={o.v} type="button" aria-pressed={view === o.v} onClick={() => update({ view: o.v === "all" ? null : o.v })} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", view === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
          <button type="button" onClick={() => update({ type: null })} aria-pressed={!type} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium", !type ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>
            Todos los tipos
          </button>
          {Object.entries(NOTIFICATION_TYPE_LABELS).map(([k, label]) => (
            <button key={k} type="button" onClick={() => update({ type: type === k ? null : k })} aria-pressed={type === k} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium", type === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" disabled={unread === 0 || busy} onClick={() => run(() => markNotificationsReadAction({ all: true }), "Todo marcado como leído")}>
          <CheckCheck /> Marcar todo como leído
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-card">
          <EmptyState icon={<Bell className="size-5" />} title={view === "unread" ? "No tienes notificaciones sin leer" : "No hay notificaciones"} description="Cuando un lead se te asigne, una tarea venza o una visita esté por empezar, lo verás aquí." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <Checkbox checked={allSelected} onCheckedChange={(c) => setSelected(c ? new Set(items.map((i) => i.id)) : new Set())} aria-label="Seleccionar todas" />
            {selected.size > 0 ? (
              <>
                <span>{selected.size} seleccionada{selected.size === 1 ? "" : "s"}</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => markNotificationsReadAction({ ids: [...selected] }), "Marcadas como leídas")}>
                  <CheckCheck /> Marcar leídas
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => run(() => deleteNotificationsAction({ ids: [...selected] }))}>
                  <Trash2 /> Eliminar
                </Button>
              </>
            ) : (
              <span>{total} notificación{total === 1 ? "" : "es"}</span>
            )}
          </div>
          <ul className="divide-y">
            {items.map((n) => {
              const meta = NOTIFICATION_ICONS[n.type] ?? { icon: Bell, tone: "bg-slate-100 text-slate-600" };
              const Icon = meta.icon;
              return (
                <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3 hover:bg-muted/40", !n.read_at && "bg-primary/[0.04]")}>
                  <Checkbox className="mt-2" checked={selected.has(n.id)} onCheckedChange={() => toggle(n.id)} aria-label={`Seleccionar: ${n.title}`} />
                  <button type="button" onClick={() => open(n)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", meta.tone)}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm leading-snug", !n.read_at ? "font-medium" : "text-muted-foreground")}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/80">
                        <RelativeTime value={n.created_at} />
                        <span>· {NOTIFICATION_TYPE_LABELS[n.type] ?? "General"}</span>
                      </span>
                    </span>
                    {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
