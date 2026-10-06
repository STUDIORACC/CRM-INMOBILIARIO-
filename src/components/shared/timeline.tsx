"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, MoreHorizontal, Pencil, Pin, PinOff, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteNoteAction, logActivityAction, pinNoteAction, updateNoteAction } from "@/actions/leads";
import { ActivityIcon } from "@/components/shared/activity-icon";
import { ConfirmDialog } from "@/components/shared/app-dialog";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { dayLabel, fmtDate, fmtDateTimeFull, fmtRelative, fmtTime } from "@/lib/domain/dates";
import type { TimelineItem } from "@/lib/services/timeline";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";
import { useSession } from "@/components/providers/app-context";

const FILTERS: Array<{ key: string; label: string; types: string[] | null }> = [
  { key: "all", label: "Todo", types: null },
  { key: "contact", label: "Contactos", types: ["call", "whatsapp", "email", "meeting", "follow_up"] },
  { key: "visit", label: "Visitas", types: ["visit"] },
  { key: "note", label: "Notas", types: ["note"] },
  { key: "system", label: "Eventos", types: ["system", "task"] },
];

function groupLabel(iso: string): string {
  const d = dayLabel(iso);
  return d === "Hoy" || d === "Ayer" ? d : fmtDate(iso);
}

interface RecordLink {
  leadId?: string;
  clientId?: string;
  opportunityId?: string;
  propertyId?: string;
  ownerId?: string;
}

/** Línea de tiempo comercial: contactos, visitas, notas y eventos del sistema en orden cronológico. */
export function ActivityTimeline({
  items,
  link,
  allowNotes = true,
  showParty = false,
  title = "Historial comercial",
  pinned,
}: {
  items: TimelineItem[];
  link?: RecordLink;
  allowNotes?: boolean;
  showParty?: boolean;
  title?: string;
  pinned?: TimelineItem[];
}) {
  const [filter, setFilter] = useState("all");
  const types = FILTERS.find((f) => f.key === filter)?.types;
  const visible = useMemo(() => (types ? items.filter((i) => types.includes(i.type)) : items), [items, types]);

  const groups = useMemo(() => {
    const out: Array<{ label: string; items: TimelineItem[] }> = [];
    for (const it of visible) {
      const label = groupLabel(it.occurred_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(it);
      else out.push({ label, items: [it] });
    }
    return out;
  }, [visible]);

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" /> {title}
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular">{items.length}</span>
        </h3>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar historial">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {allowNotes && link && <QuickNote link={link} />}

      {pinned && pinned.length > 0 && (
        <div className="space-y-2 border-b bg-amber-50/50 px-5 py-3">
          {pinned.map((n) => (
            <div key={n.id} className="flex gap-2 text-sm">
              <Pin className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <span className="whitespace-pre-wrap">{n.note_body ?? n.body}</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4">
        {visible.length === 0 ? (
          <EmptyState compact icon={<History className="size-5" />} title="Sin registros en este filtro" description="Cuando registres llamadas, visitas o notas aparecerán aquí." />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</div>
                <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
                  {g.items.map((it) => (
                    <TimelineEntry key={it.id} item={it} showParty={showParty} />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TimelineEntry({ item, showParty }: { item: TimelineItem; showParty: boolean }) {
  const session = useSession();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.note_body ?? item.body ?? "");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const isNote = item.type === "note" && item.note_id;
  const mine = item.user_id === session.id || session.role === "admin" || session.role === "manager";
  const contact = ["call", "whatsapp", "email"].includes(item.type);
  const partyHref = item.lead_id ? `/leads/${item.lead_id}` : item.client_id ? `/clients/${item.client_id}` : null;

  const saveEdit = async () => {
    setBusy(true);
    const res = await updateNoteAction({ id: item.note_id!, body: text });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setEditing(false);
    toast.success(res.message);
  };

  return (
    <li className="relative flex gap-3">
      <ActivityIcon type={item.type} event={item.event} />
      <div className="min-w-0 flex-1 rounded-lg pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn("text-sm", item.type === "system" ? "font-medium" : "font-semibold")}>{item.title}</span>
          {showParty && (item.lead_name || item.client_name) && partyHref && (
            <Link href={partyHref} className="text-sm text-primary hover:underline">
              {item.lead_name ?? item.client_name}
            </Link>
          )}
          {contact && item.direction === "inbound" && (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
              <ArrowDownLeft className="size-3" /> Entrante
            </span>
          )}
          {contact && item.direction === "outbound" && (
            <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
              <ArrowUpRight className="size-3" /> Saliente
            </span>
          )}
          {contact && item.responded != null && (
            <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium", item.responded ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
              {item.responded ? <Check className="size-3" /> : null}
              {item.responded ? "Respondió" : "Sin respuesta"}
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={busy || text.trim().length === 0}>
                {busy && <Loader2 className="animate-spin" />} Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          item.body && <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">{item.body}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <time dateTime={item.occurred_at} title={fmtDateTimeFull(item.occurred_at)} suppressHydrationWarning>
            {fmtTime(item.occurred_at)} · {fmtRelative(item.occurred_at)}
          </time>
          {item.actor && <span>· {item.actor}</span>}
          {item.property_code && item.property_id && (
            <Link href={`/properties/${item.property_id}`} className="rounded bg-muted px-1.5 py-0.5 font-medium hover:text-primary">
              {item.property_code}
            </Link>
          )}
        </div>
      </div>
      {isNote && mine && !editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Acciones de la nota">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                const res = await pinNoteAction({ id: item.note_id!, pinned: !item.note_pinned });
                if (!res.ok) toast.error(res.error);
                else toast.success(item.note_pinned ? "Nota desfijada" : "Nota fijada");
              }}
            >
              {item.note_pinned ? <PinOff /> : <Pin />} {item.note_pinned ? "Quitar de fijadas" : "Fijar nota"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
              <Trash2 /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Eliminar la nota?"
        description="Se quitará del historial. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          const res = await deleteNoteAction({ id: item.note_id! });
          if (res.ok) toast.success(res.message);
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      />
    </li>
  );
}

function QuickNote({ link }: { link: RecordLink }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const res = await logActivityAction({
      type: "note",
      title: "Nota agregada",
      body: text.trim(),
      direction: "outbound",
      leadId: link.leadId ?? "",
      clientId: link.clientId ?? "",
      opportunityId: link.opportunityId ?? "",
      propertyId: link.propertyId ?? "",
      ownerId: link.ownerId ?? "",
      followUpAt: "",
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Nota agregada");
    setText("");
  };
  return (
    <div className="flex gap-2 border-b px-5 py-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={1}
        placeholder="Agregar una nota rápida… (Ctrl + Enter para guardar)"
        className="min-h-9 resize-none py-2"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void send();
        }}
        aria-label="Nueva nota"
      />
      <Button onClick={send} disabled={busy || !text.trim()} aria-label="Agregar nota">
        {busy ? <Loader2 className="animate-spin" /> : <Send />}
        <span className="hidden sm:inline">Agregar</span>
      </Button>
    </div>
  );
}

