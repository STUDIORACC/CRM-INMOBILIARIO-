"use client";

import { useState } from "react";
import { assignEntityAction } from "@/actions/assign";
import { Form, FormError, SelectField, SubmitButton } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs } from "@/components/providers/app-context";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { assignSchema } from "@/lib/validation/leads";

const ENTITY_LABEL = { lead: "lead", client: "cliente", opportunity: "oportunidad", property: "propiedad" } as const;

export default function AssignDialog({ ctx, onClose }: DialogProps<"assign">) {
  const { users } = useCatalogs();
  const [moveOpen, setMoveOpen] = useState(true);
  const count = ctx.ids.length;
  const eligible = users.filter((u) => u.status === "active" && (ctx.entity === "property" ? u.role !== "assistant" : u.role === "advisor" || u.role === "manager" || u.role === "admin"));

  const { form, submit, formError, submitting } = useActionForm({
    schema: assignSchema.pick({ userId: true }),
    defaultValues: { userId: ctx.currentUserId ?? "" },
    action: (v) => assignEntityAction({ entity: ctx.entity, ids: ctx.ids, userId: v.userId, moveOpenWork: moveOpen }),
    onSuccess: onClose,
  });

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={ctx.entity === "property" ? "Asignar asesor responsable" : "Asignar vendedor"}
      description={count === 1 ? (ctx.label ?? `Selecciona quién gestionará este ${ENTITY_LABEL[ctx.entity]}.`) : `Se asignarán ${count} ${ENTITY_LABEL[ctx.entity]}s.`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="assign-form" loading={submitting}>
            Asignar
          </SubmitButton>
        </>
      }
    >
      <Form id="assign-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <SelectField name="userId" label="Responsable" required placeholder="Selecciona una persona" options={eligible.map((u) => ({ value: u.id, label: u.fullName }))} />
        {ctx.entity === "lead" && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <Checkbox checked={moveOpen} onCheckedChange={(v) => setMoveOpen(v === true)} className="mt-0.5" />
            <span>
              <span className="font-medium">Mover también el trabajo abierto</span>
              <span className="block text-xs text-muted-foreground">Oportunidades abiertas, tareas pendientes y visitas programadas pasan al nuevo responsable.</span>
            </span>
          </label>
        )}
      </Form>
    </AppDialog>
  );
}
