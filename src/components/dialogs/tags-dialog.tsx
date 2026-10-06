"use client";

import { Check, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { setTagsAction } from "@/actions/leads";
import { createTagAction } from "@/actions/tags";
import { useCatalogs } from "@/components/providers/app-context";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COLORS = ["#6366f1", "#3b82f6", "#14b8a6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];

export default function TagsDialog({ ctx, onClose }: DialogProps<"tags">) {
  const { tags: catalogTags } = useCatalogs();
  const [extra, setExtra] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [selected, setSelected] = useState<string[]>(ctx.current);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const all = [...catalogTags, ...extra.filter((e) => !catalogTags.some((t) => t.id === e.id))];

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    if (name.trim().length < 2) return;
    setCreating(true);
    const res = await createTagAction({ name, color });
    setCreating(false);
    if (!res.ok) return toast.error(res.error);
    setExtra((e) => [...e, res.data]);
    setSelected((s) => [...s, res.data.id]);
    setName("");
  };

  const save = async () => {
    setSaving(true);
    const res = await setTagsAction({ entity: ctx.entity, id: ctx.id, tagIds: selected });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message);
    onClose();
  };

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Etiquetas"
      description="Segmenta para filtrar y dar seguimiento más rápido."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {all.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(t.id)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", on ? "text-white" : "bg-white text-foreground hover:bg-accent")}
              style={on ? { backgroundColor: t.color, borderColor: t.color } : undefined}
            >
              {on && <Check className="size-3.5" />}
              {t.name}
            </button>
          );
        })}
        {all.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay etiquetas. Crea la primera.</p>}
      </div>
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="text-xs font-medium text-muted-foreground">Crear etiqueta nueva</div>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Referido de cliente" maxLength={30} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())} />
          <Button variant="outline" onClick={create} disabled={creating || name.trim().length < 2}>
            {creating ? <Loader2 className="animate-spin" /> : <Plus />}
            Crear
          </Button>
        </div>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}`} className={cn("size-6 rounded-full ring-offset-2", color === c && "ring-2 ring-foreground/60")} style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
    </AppDialog>
  );
}
