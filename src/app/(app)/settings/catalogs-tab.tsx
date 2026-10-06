"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { moveCatalogItemAction, saveCatalogItemAction, updateStageAction } from "@/actions/settings";
import { ColorField, Form, FormError, SelectField, SubmitButton, SwitchField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs } from "@/components/providers/app-context";
import { AppDialog } from "@/components/shared/app-dialog";
import { Panel } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { CatalogItem, StageDef } from "@/lib/types/catalogs";
import { catalogItemSchema, stageSchema, type CatalogName } from "@/lib/validation/settings";
import { cn } from "@/lib/utils";

const CATALOGS: Array<{ name: CatalogName; title: string; description: string; noun: string; colored: boolean; pick: (c: ReturnType<typeof useCatalogs>) => CatalogItem[] }> = [
  { name: "lead_source", title: "Fuentes de leads", description: "De dónde llegan tus consultas. Alimenta los reportes de origen y conversión.", noun: "fuente", colored: true, pick: (c) => c.sources },
  { name: "loss_reason", title: "Motivos de pérdida", description: "Se piden al cerrar una oportunidad o lead como perdido.", noun: "motivo", colored: false, pick: (c) => c.lossReasons },
  { name: "property_type", title: "Tipos de propiedad", description: "Departamento, casa, terreno, local…", noun: "tipo", colored: false, pick: (c) => c.propertyTypes },
  { name: "district", title: "Distritos", description: "Zonas donde opera la inmobiliaria. Se usan en propiedades, búsquedas y matching.", noun: "distrito", colored: false, pick: (c) => c.districts },
];

export function CatalogsTab() {
  const catalogs = useCatalogs();
  return (
    <div className="space-y-4">
      <StagesPanel stages={catalogs.stages} />
      <div className="grid gap-4 xl:grid-cols-2">
        {CATALOGS.map((c) => (
          <CatalogPanel key={c.name} def={c} items={c.pick(catalogs)} />
        ))}
      </div>
    </div>
  );
}

function CatalogPanel({ def, items }: { def: (typeof CATALOGS)[number]; items: CatalogItem[] }) {
  const [editing, setEditing] = useState<CatalogItem | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (item: CatalogItem, active: boolean) => {
    setBusy(item.id);
    const res = await saveCatalogItemAction({ id: item.id, catalog: def.name, label: item.label, color: item.color ?? "", active });
    setBusy(null);
    if (!res.ok) toast.error(res.error);
    else toast.success(active ? "Elemento activado" : "Elemento desactivado: ya no aparece en los formularios");
  };
  const move = async (item: CatalogItem, direction: "up" | "down") => {
    setBusy(item.id);
    const res = await moveCatalogItemAction({ id: item.id, direction });
    setBusy(null);
    if (!res.ok) toast.error(res.error);
  };

  return (
    <Panel
      title={def.title}
      description={def.description}
      count={items.length}
      action={
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus /> Agregar
        </Button>
      }
      bodyClassName="px-0"
    >
      <ul className="max-h-[26rem] divide-y overflow-y-auto border-t">
        {items.map((it, i) => (
          <li key={it.id} className={cn("flex items-center gap-2 px-5 py-2", !it.active && "bg-muted/40")}>
            {def.colored && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: it.color ?? "#9aa3b2" }} />}
            <span className={cn("min-w-0 flex-1 truncate text-sm", !it.active && "text-muted-foreground line-through")}>{it.label}</span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label="Subir" disabled={i === 0 || busy === it.id} onClick={() => move(it, "up")}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Bajar" disabled={i === items.length - 1 || busy === it.id} onClick={() => move(it, "down")}>
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Editar ${it.label}`} onClick={() => setEditing(it)}>
                <Pencil />
              </Button>
              <Switch checked={it.active} disabled={busy === it.id} onCheckedChange={(v) => toggle(it, v)} aria-label={it.active ? "Desactivar" : "Activar"} className="ml-1" />
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted-foreground">Aún no hay elementos.</li>}
      </ul>
      {editing && <CatalogDialog def={def} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function CatalogDialog({ def, item, onClose }: { def: (typeof CATALOGS)[number]; item: CatalogItem | null; onClose: () => void }) {
  const { form, submit, formError, submitting } = useActionForm({
    schema: catalogItemSchema,
    defaultValues: { id: item?.id, catalog: def.name, label: item?.label ?? "", color: item?.color ?? "#6366f1", active: item?.active ?? true },
    action: saveCatalogItemAction,
    onSuccess: onClose,
    successMessage: item ? "Elemento actualizado" : "Elemento agregado",
  });
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? `Editar ${def.noun}` : `Agregar ${def.noun}`}
      description={item ? "Renombrar no afecta a los registros existentes: conservan su vínculo." : undefined}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="catalog-form" loading={submitting}>
            {item ? "Guardar" : "Agregar"}
          </SubmitButton>
        </>
      }
    >
      <Form id="catalog-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <TextField name="label" label="Nombre" required autoFocus />
        {def.colored && <ColorField name="color" label="Color" />}
        <SwitchField name="active" label="Activo" hint="Los elementos inactivos no aparecen al crear o editar registros, pero se conservan en el historial." />
      </Form>
    </AppDialog>
  );
}

const PROBABILITIES = [10, 25, 50, 75, 90];

function StagesPanel({ stages }: { stages: StageDef[] }) {
  const [editing, setEditing] = useState<StageDef | null>(null);
  return (
    <Panel title="Etapas del pipeline" description="Las 10 etapas del embudo de oportunidades. Puedes renombrarlas, ajustar su color y la probabilidad de cierre que se asigna al entrar." bodyClassName="px-0">
      <ul className="divide-y border-t">
        {stages.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-5 text-xs font-semibold text-muted-foreground tabular">{i + 1}</span>
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.label}</span>
            <span className="text-xs text-muted-foreground">{s.kind === "open" ? "Abierta" : s.kind === "won" ? "Ganada" : "Perdida"}</span>
            <span className="w-12 text-right text-sm tabular">{s.defaultProbability}%</span>
            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${s.label}`} onClick={() => setEditing(s)}>
              <Pencil />
            </Button>
          </li>
        ))}
      </ul>
      {editing && <StageDialog stage={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function StageDialog({ stage, onClose }: { stage: StageDef; onClose: () => void }) {
  const { form, submit, formError, submitting } = useActionForm({
    schema: stageSchema,
    defaultValues: { key: stage.key, label: stage.label, defaultProbability: stage.defaultProbability, color: stage.color },
    action: (v) => updateStageAction({ ...v, defaultProbability: Number(v.defaultProbability) }),
    onSuccess: onClose,
    successMessage: "Etapa actualizada",
  });
  const fixed = stage.kind !== "open";
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Editar etapa: ${stage.label}`}
      description={fixed ? "Las etapas finales mantienen su probabilidad (100% ganada, 0% perdida)." : "La probabilidad se usa para calcular el pipeline ponderado."}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="stage-form" loading={submitting}>
            Guardar
          </SubmitButton>
        </>
      }
    >
      <Form id="stage-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <TextField name="label" label="Nombre de la etapa" required autoFocus />
        {!fixed && (
          <SelectField
            name="defaultProbability"
            label="Probabilidad de cierre"
            required
            options={PROBABILITIES.map((p) => ({ value: String(p), label: `${p}%` }))}
          />
        )}
        <ColorField name="color" label="Color" />
      </Form>
    </AppDialog>
  );
}
