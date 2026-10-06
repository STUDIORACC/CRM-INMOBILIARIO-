"use client";

import { addDays, setHours, setMinutes } from "date-fns";
import { useWatch } from "react-hook-form";
import { logActivityAction } from "@/actions/leads";
import { EntityField } from "@/components/forms/entity-field";
import { Form, FormError, SelectField, SubmitButton, SwitchField, TextField, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { ACTIVITY_TYPES, MANUAL_ACTIVITY_TYPES, labelOf, type ActivityType } from "@/lib/domain/constants";
import { toInputDateTime, tz } from "@/lib/domain/dates";
import { activitySchema, type ActivityInput } from "@/lib/validation/leads";
import { activityVisual } from "@/components/shared/activity-icon";
import { cn } from "@/lib/utils";
import { useState } from "react";

const PLACEHOLDERS: Record<string, string> = {
  call: "¿Qué se conversó? Presupuesto, zonas, urgencia, objeciones…",
  whatsapp: "Resumen de la conversación o mensaje enviado",
  email: "Asunto y resumen del correo",
  meeting: "Temas tratados y acuerdos",
  follow_up: "Detalle del seguimiento realizado",
  note: "Escribe la nota (queda visible en el historial)",
};

export default function ActivityDialog({ ctx, onClose }: DialogProps<"activity">) {
  const [chip, setChip] = useState<string | null>(null);
  const { form, submit, formError, submitting } = useActionForm({
    schema: activitySchema,
    defaultValues: {
      type: (ctx.type ?? "call") as ActivityInput["type"],
      title: "",
      body: "",
      direction: "outbound",
      responded: true,
      leadId: ctx.leadId ?? "",
      clientId: ctx.clientId ?? "",
      opportunityId: ctx.opportunityId ?? "",
      propertyId: ctx.propertyId ?? "",
      ownerId: ctx.ownerId ?? "",
      followUpAt: "",
    } satisfies ActivityInput,
    action: logActivityAction,
    successMessage: "Actividad registrada",
    onSuccess: onClose,
  });

  const type = useWatch({ control: form.control, name: "type" }) as string;
  const contact = ["call", "whatsapp", "email"].includes(type);
  const hasTarget = Boolean(ctx.leadId || ctx.clientId || ctx.opportunityId || ctx.propertyId || ctx.ownerId);
  const now = tz();
  const followChips: Array<[string, Date]> = [
    ["Mañana 10 a. m.", setMinutes(setHours(addDays(now, 1), 10), 0)],
    ["En 3 días", setMinutes(setHours(addDays(now, 3), 10), 0)],
    ["En 1 semana", setMinutes(setHours(addDays(now, 7), 10), 0)],
  ];

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Registrar actividad"
      description={ctx.leadName ?? ctx.clientName ?? "Deja constancia en el historial comercial."}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="activity-form" loading={submitting}>
            Registrar
          </SubmitButton>
        </>
      }
    >
      <Form id="activity-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <div>
          <div className="mb-1.5 text-[13px] font-medium">Tipo de actividad</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Tipo de actividad">
            {MANUAL_ACTIVITY_TYPES.map((t) => {
              const v = activityVisual(t);
              const Icon = v.icon;
              const on = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => form.setValue("type", t as ActivityType & ActivityInput["type"], { shouldValidate: true })}
                  className={cn("flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors", on ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground hover:bg-accent")}
                >
                  <Icon className="size-4" />
                  {labelOf(ACTIVITY_TYPES, t)}
                </button>
              );
            })}
          </div>
        </div>

        {contact && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="direction"
              label="Dirección"
              options={[
                { value: "outbound", label: "Saliente (contactamos al cliente)" },
                { value: "inbound", label: "Entrante (el cliente nos escribió/llamó)" },
              ]}
            />
            <SwitchField name="responded" label="El cliente respondió" hint="Suma al scoring del lead" className="self-end" />
          </div>
        )}

        <TextareaField name="body" label={type === "note" ? "Nota" : "Resumen"} rows={4} placeholder={PLACEHOLDERS[type] ?? ""} required={type === "note"} />

        {!hasTarget && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">¿A quién corresponde? (elige al menos uno)</div>
            <EntityField name="leadId" kind="lead" placeholder="Lead" />
            <EntityField name="clientId" kind="client" placeholder="Cliente" />
          </div>
        )}

        {type !== "note" && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <TextField name="followUpAt" label="Programar siguiente seguimiento (opcional)" type="datetime-local" />
            <div className="flex flex-wrap gap-1.5">
              {followChips.map(([label, d]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setChip(label);
                    form.setValue("followUpAt", toInputDateTime(d.toISOString()), { shouldDirty: true });
                  }}
                  className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", chip === label ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground hover:bg-accent")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Form>
    </AppDialog>
  );
}
