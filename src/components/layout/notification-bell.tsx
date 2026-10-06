"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Bell, CalendarClock, CheckCheck, ClipboardX, Handshake, Home, UserPlus, UserRoundCheck, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationsReadAction } from "@/actions/notifications";
import { RelativeTime } from "@/components/shared/relative-time";
import { cn } from "@/lib/utils";

// --- Contador compartido (sidebar + campana) ----------------------------------------
let unreadCount = 0;
const listeners = new Set<() => void>();
const setUnread = (n: number) => {
  if (n === unreadCount) return;
  unreadCount = n;
  listeners.forEach((l) => l());
};
export function useNotificationCount(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => unreadCount,
    () => 0,
  );
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export const NOTIFICATION_ICONS: Record<string, { icon: typeof Bell; tone: string }> = {
  lead_assigned: { icon: UserPlus, tone: "bg-indigo-50 text-indigo-600" },
  follow_up_overdue: { icon: TimerOff, tone: "bg-rose-50 text-rose-600" },
  task_overdue: { icon: ClipboardX, tone: "bg-rose-50 text-rose-600" },
  visit_upcoming: { icon: CalendarClock, tone: "bg-amber-50 text-amber-600" },
  visit_cancelled: { icon: CalendarClock, tone: "bg-slate-100 text-slate-600" },
  opportunity_stalled: { icon: TimerOff, tone: "bg-orange-50 text-orange-600" },
  opportunity_new: { icon: Handshake, tone: "bg-emerald-50 text-emerald-600" },
  property_reserved: { icon: Home, tone: "bg-teal-50 text-teal-600" },
  client_new: { icon: UserRoundCheck, tone: "bg-sky-50 text-sky-600" },
};

export function NotificationBell({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  const count = useNotificationCount();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => setUnread(initialCount), [initialCount]);

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?mode=count", { cache: "no-store" });
      if (res.ok) setUnread(((await res.json()) as { unread: number }).unread);
    } catch {
      /* sin conexión: se reintenta en el siguiente ciclo */
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refreshCount, 60_000);
    const onFocus = () => refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/notifications?limit=8", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { items: NotificationItem[]; unread: number }) => {
        if (cancelled) return;
        setItems(d.items);
        setUnread(d.unread);
      })
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const readAll = async () => {
    await markNotificationsReadAction({ all: true });
    setItems((prev) => prev?.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })) ?? prev);
    setUnread(0);
  };

  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.read_at) {
      setUnread(Math.max(0, unreadCount - 1));
      void markNotificationsReadAction({ ids: [n.id] });
    }
    if (n.href) router.push(n.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notificaciones${count ? `, ${count} sin leer` : ""}`}>
          <Bell className="size-[18px]" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-[18px] text-white tabular ring-2 ring-background">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,24rem)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">Notificaciones</div>
          <Button variant="ghost" size="sm" onClick={readAll} disabled={count === 0}>
            <CheckCheck /> Marcar todo como leído
          </Button>
        </div>
        <div className="max-h-[26rem] overflow-y-auto">
          {items === null && <div className="p-6 text-center text-sm text-muted-foreground">Cargando…</div>}
          {items?.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No tienes notificaciones.</div>}
          {items?.map((n) => {
            const meta = NOTIFICATION_ICONS[n.type] ?? { icon: Bell, tone: "bg-slate-100 text-slate-600" };
            const Icon = meta.icon;
            return (
              <button key={n.id} type="button" onClick={() => openItem(n)} className={cn("flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60", !n.read_at && "bg-primary/[0.04]")}>
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", meta.tone)}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", !n.read_at ? "font-medium" : "text-muted-foreground")}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.body}</span>}
                  <RelativeTime value={n.created_at} className="mt-1 block text-[11px] text-muted-foreground/80" />
                </span>
                {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />}
              </button>
            );
          })}
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full" onClick={() => { setOpen(false); router.push("/notifications"); }}>
            Ver todas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
