"use client";

import { addDays, addHours, setHours, setMinutes } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createTaskAction, updateTaskAction } from "@/actions/tasks";
import { EntityField } from "@/components/forms/entity-field";
import { Form, FormError, SelectField, SubmitButton, TextField, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs, useSession } from "@/components/providers/app-context";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { PRIORITIES, TASK_KINDS } from "@/lib/domain/constants";
import { toInputDateTime, tz } from "@/lib/domain/dates";
import { taskSchema, type TaskInput } from "@/lib/validation/tasks";

const OPTS = {
  kinds: TASK_KINDS.map((k) => ({ value: k.value, label: k.label })),
  priorities: PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
};

function atHour(base: Date, h: number, m = 0): Date {
  return setMinutes(setHours(base, h), m);
}

export default function TaskDialog({ ctx, onClose }: DialogProps<"task">) {
  const session = useSession();
  const { users } = useCatalogs();
  const editing = Boolean(ctx.task?.id);
  const [chip, setChip] = useState<string | null>(null);

  const now = tz();
  const defaultDue = ctx.defaultDueAt ?? toInputDateTime(atHour(addDays(now, 1), 10).toISOString());

  const { form, submit, formError, submitting } = useActionForm({
    schema: taskSchema,
    defaultValues: {
      title: ctx.task?.title ?? ctx.defaultTitle ?? "",
      description: ctx.task?.description ?? "",
      kind: (ctx.task?.kind ?? ctx.defaultKind ?? "follow_up") as TaskInput["kind"],
      assignedTo: ctx.task?.assignedTo ?? session.id,
      priority: ctx.task?.priority ?? "medium",
      dueAt: ctx.task?.dueAt ?? defaultDue,
      leadId: ctx.task?.leadId ?? ctx.leadId ?? "",
      clientId: ctx.task?.clientId ?? ctx.clientId ?? "",
      opportunityId: ctx.task?.opportunityId ?? ctx.opportunityId ?? "",
      propertyId: ctx.task?.propertyId ?? ctx.propertyId ?? "",
    } satisfies TaskInput,
    action: async (v) => {
      const res = editing ? await updateTaskAction({ ...v, id: ctx.task!.id }) : await createTaskAction(v);
      return res.ok ? { ok: true as const, data: undefined, message: res.message } : res;
    },
    successMessage: editing ? "Tarea actualizada" : "Tarea creada",
    onSuccess: onClose,
  });

  const setDue = (label: string, d: Date) => {
    setChip(label);
    form.setValue("dueAt", toInputDateTime(d.toISOString()), { shouldValidate: true, shouldDirty: true });
  };

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Editar tarea" : "Nueva tarea"}
      description="Programa un seguimiento para que nada se quede sin respuesta."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="task-form" loading={submitting}>
            {editing ? "Guardar cambios" : "Crear tarea"}
          </SubmitButton>
        </>
      }
    >
      <Form id="task-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <TextField name="title" label="Tarea" placeholder="Ej. Llamar a Carlos para confirmar la visita" required autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="kind" label="Tipo" options={OPTS.kinds} required />
          <SelectField name="priority" label="Prioridad" options={OPTS.priorities} required />
        </div>
        <div className="space-y-2">
          <TextField name="dueAt" label="Fecha y hora límite" type="datetime-local" required />
          <div className="flex flex-wrap gap-1.5">
            {[
              ["En 2 horas", () => addHours(now, 2)],
              ["Hoy 5 p. m.", () => atHour(now, 17)],
              ["Mañana 10 a. m.", () => atHour(addDays(now, 1), 10)],
              ["En 3 días", () => atHour(addDays(now, 3), 10)],
              ["Próxima semana", () => atHour(addDays(now, 7), 10)],
            ].map(([label, fn]) => (
              <button
                key={label as string}
                type="button"
                onClick={() => setDue(label as string, (fn as () => Date)())}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${chip === label ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground hover:bg-accent"}`}
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>
        <SelectField name="assignedTo" label="Responsable" options={users.filter((u) => u.status === "active").map((u) => ({ value: u.id, label: u.fullName }))} required />
        <TextareaField name="description" label="Detalle (opcional)" rows={2} placeholder="Contexto o instrucciones para quien ejecute la tarea" />
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-medium text-muted-foreground">Vincular a (opcional)</div>
          <EntityField name="leadId" kind="lead" initialLabel={ctx.leadName} placeholder="Lead" />
          <EntityField name="clientId" kind="client" initialLabel={ctx.clientName} placeholder="Cliente" />
          <EntityField name="propertyId" kind="property" initialLabel={ctx.propertyLabel} placeholder="Propiedad" />
        </div>
      </Form>
    </AppDialog>
  );
}

