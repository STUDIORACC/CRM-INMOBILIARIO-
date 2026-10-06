"use client";

import { useMemo, useRef, useState } from "react";
import { MessageCircle, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTemplateAction, saveTemplateAction } from "@/actions/settings";
import { Form, FormError, SelectField, SubmitButton, SwitchField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs, useSession } from "@/components/providers/app-context";
import { AppDialog, ConfirmDialog } from "@/components/shared/app-dialog";
import { Panel } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_CATEGORIES, TEMPLATE_VARIABLES, labelOf } from "@/lib/domain/constants";
import { fillTemplate } from "@/lib/domain/templates";
import type { TemplateDef } from "@/lib/types/catalogs";
import { templateSchema } from "@/lib/validation/settings";
import { cn } from "@/lib/utils";

const SAMPLE: Record<string, string> = {
  nombre: "Carlos",
  asesor: "María Fernanda",
  empresa: "Altura Inmobiliaria",
  propiedad: "Departamento en San Miguel",
  codigo: "SM-024",
  precio: "S/ 480,000",
  direccion: "San Miguel",
  fecha: "viernes 9 de octubre",
  hora: "4:30 p. m.",
};

export function TemplatesTab() {
  const { templates } = useCatalogs();
  const [editing, setEditing] = useState<TemplateDef | "new" | null>(null);
  const [deleting, setDeleting] = useState<TemplateDef | null>(null);
  const grouped = useMemo(() => {
    const m = new Map<string, TemplateDef[]>();
    for (const t of templates) (m.get(t.category) ?? m.set(t.category, []).get(t.category)!).push(t);
    return [...m.entries()].sort((a, b) => TEMPLATE_CATEGORIES.findIndex((c) => c.value === a[0]) - TEMPLATE_CATEGORIES.findIndex((c) => c.value === b[0]));
  }, [templates]);

  return (
    <div className="space-y-4">
      <Panel
        title="Plantillas de mensajes"
        description="Textos listos para WhatsApp y correo. Al enviarlos desde un lead, cliente o visita, las variables se completan solas con los datos del registro."
        count={templates.length}
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Nueva plantilla
          </Button>
        }
        bodyClassName="px-0"
      >
        {templates.length === 0 ? (
          <EmptyState compact icon={<MessageCircle className="size-5" />} title="Aún no hay plantillas" description="Crea la primera para responder más rápido a tus leads." />
        ) : (
          <div className="border-t">
            {grouped.map(([cat, list]) => (
              <section key={cat}>
                <h4 className="bg-muted/40 px-5 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{labelOf(TEMPLATE_CATEGORIES, cat)}</h4>
                <ul className="divide-y">
                  {list.map((t) => (
                    <li key={t.id} className={cn("flex items-start gap-3 px-5 py-3", !t.active && "opacity-60")}>
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", t.channel === "whatsapp" ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600")}>{t.channel === "whatsapp" ? <MessageCircle className="size-4" /> : <Mail className="size-4" />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{t.name}</span>
                          {!t.active && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">Inactiva</span>}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{fillTemplate(t.body, SAMPLE)}</p>
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${t.name}`} className="text-destructive" onClick={() => setDeleting(t)}>
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
      {editing && <TemplateDialog template={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Eliminar «${deleting.name}»`}
          description="La plantilla dejará de estar disponible al enviar mensajes. Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          destructive
          onConfirm={async () => {
            const res = await deleteTemplateAction({ id: deleting.id });
            if (res.ok) toast.success(res.message);
            return res.ok ? undefined : { ok: false, error: res.error };
          }}
        />
      )}
    </div>
  );
}

function TemplateDialog({ template, onClose }: { template: TemplateDef | null; onClose: () => void }) {
  const session = useSession();
  const { form, submit, formError, submitting } = useActionForm({
    schema: templateSchema,
    defaultValues: { id: template?.id, name: template?.name ?? "", channel: template?.channel ?? ("whatsapp" as const), category: template?.category ?? "general", subject: template?.subject ?? "", body: template?.body ?? "", active: template?.active ?? true },
    action: saveTemplateAction,
    onSuccess: onClose,
    successMessage: template ? "Plantilla actualizada" : "Plantilla creada",
  });
  const body = (form.watch("body") as string) ?? "";
  const channel = form.watch("channel") as string;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const preview = fillTemplate(body, { ...SAMPLE, asesor: session.fullName });

  const insert = (key: string) => {
    const el = ref.current;
    const token = `{{${key}}}`;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    form.setValue("body", next, { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const bodyReg = form.register("body");

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={template ? "Editar plantilla" : "Nueva plantilla"}
      description="Usa variables para personalizar el mensaje automáticamente."
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="template-form" loading={submitting}>
            {template ? "Guardar cambios" : "Crear plantilla"}
          </SubmitButton>
        </>
      }
    >
      <Form id="template-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="name" label="Nombre" required autoFocus className="sm:col-span-3" />
          <SelectField name="channel" label="Canal" required options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Correo" }]} />
          <SelectField name="category" label="Categoría" required options={TEMPLATE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} className="sm:col-span-2" />
          {channel === "email" && <TextField name="subject" label="Asunto" className="sm:col-span-3" />}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="f-body" className="text-[13px] font-medium">
              Mensaje<span className="ml-0.5 text-destructive">*</span>
            </label>
            <Textarea
              id="f-body"
              rows={9}
              aria-invalid={Boolean(form.formState.errors.body)}
              {...bodyReg}
              ref={(el) => {
                bodyReg.ref(el);
                ref.current = el;
              }}
            />
            {form.formState.errors.body && (
              <p role="alert" className="text-xs text-destructive">
                {String(form.formState.errors.body.message)}
              </p>
            )}
            <div className="flex flex-wrap gap-1 pt-1">
              {TEMPLATE_VARIABLES.map((v) => (
                <button key={v.key} type="button" title={v.label} onClick={() => insert(v.key)} className="rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent">
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium">Vista previa</div>
            <div className="min-h-[13rem] rounded-xl bg-[#e7f6e0] p-3 text-sm whitespace-pre-wrap text-slate-800 shadow-inner">{preview || <span className="text-muted-foreground">Escribe el mensaje para ver cómo se verá…</span>}</div>
            <p className="text-xs text-muted-foreground">Datos de ejemplo. Al enviar se usan los del lead, cliente y propiedad reales.</p>
          </div>
        </div>
        <SwitchField name="active" label="Plantilla activa" hint="Las inactivas no aparecen al enviar mensajes." />
      </Form>
    </AppDialog>
  );
}
