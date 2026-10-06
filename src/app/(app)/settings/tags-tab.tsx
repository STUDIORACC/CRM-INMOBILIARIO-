"use client";

import { useState } from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createTagAction, deleteTagAction, updateTagAction } from "@/actions/tags";
import { ColorField, Form, FormError, SubmitButton, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs } from "@/components/providers/app-context";
import { AppDialog, ConfirmDialog } from "@/components/shared/app-dialog";
import { TagChip } from "@/components/shared/badges";
import { Panel } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import type { TagDef } from "@/lib/types/catalogs";
import { z } from "zod";

const tagFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(30, "Máximo 30 caracteres"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
});

export function TagsTab() {
  const { tags } = useCatalogs();
  const [editing, setEditing] = useState<TagDef | "new" | null>(null);
  const [deleting, setDeleting] = useState<TagDef | null>(null);

  return (
    <Panel
      title="Etiquetas"
      description="Clasifica leads y clientes (Inversionista, Primera vivienda, VIP…) y fíltralos en las listas."
      count={tags.length}
      action={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Nueva etiqueta
        </Button>
      }
      bodyClassName="px-0"
    >
      {tags.length === 0 ? (
        <EmptyState compact icon={<Tag className="size-5" />} title="Aún no hay etiquetas" description="Crea la primera para empezar a clasificar tus leads." />
      ) : (
        <ul className="divide-y border-t">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
              <TagChip name={t.name} color={t.color} />
              <span className="flex-1" />
              <Button variant="ghost" size="icon-sm" aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${t.name}`} className="text-destructive" onClick={() => setDeleting(t)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <TagDialog tag={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Eliminar etiqueta «${deleting.name}»`}
          description="Se quitará de todos los leads y clientes que la tengan. Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          destructive
          onConfirm={async () => {
            const res = await deleteTagAction({ id: deleting.id });
            if (res.ok) toast.success(res.message);
            return res.ok ? undefined : { ok: false, error: res.error };
          }}
        />
      )}
    </Panel>
  );
}

function TagDialog({ tag, onClose }: { tag: TagDef | null; onClose: () => void }) {
  const { form, submit, formError, submitting } = useActionForm({
    schema: tagFormSchema,
    defaultValues: { id: tag?.id, name: tag?.name ?? "", color: tag?.color ?? "#6366f1" },
    action: (v) => (v.id ? updateTagAction({ id: v.id, name: v.name, color: v.color }) : createTagAction({ name: v.name, color: v.color })),
    onSuccess: onClose,
    successMessage: tag ? "Etiqueta actualizada" : "Etiqueta creada",
  });
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={tag ? "Editar etiqueta" : "Nueva etiqueta"}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="tag-form" loading={submitting}>
            {tag ? "Guardar" : "Crear"}
          </SubmitButton>
        </>
      }
    >
      <Form id="tag-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <TextField name="name" label="Nombre" required autoFocus maxLength={30} />
        <ColorField name="color" label="Color" />
      </Form>
    </AppDialog>
  );
}
