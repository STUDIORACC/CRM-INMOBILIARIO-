"use client";

import { useState } from "react";
import { markLeadLostAction } from "@/actions/leads";
import { markOpportunityLostAction } from "@/actions/opportunities";
import { Form, FormError, SelectField, SubmitButton, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs } from "@/components/providers/app-context";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";

const schema = z.object({
  reason: z.string().min(1, "Selecciona el motivo de pérdida"),
  notes: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});

/** Motivos que indican que el cliente ya no está en búsqueda (se sugiere cerrar también el lead). */
const CLOSES_LEAD = new Set(["no_response", "postponed", "no_financing", "other"]);

export default function LostDialog({ ctx, onClose }: DialogProps<"lost">) {
  const { lossReasons } = useCatalogs();
  const isOpp = ctx.entity === "opportunity";
  const [alsoLead, setAlsoLead] = useState(false);
  const [touched, setTouched] = useState(false);

  const { form, submit, formError, submitting } = useActionForm({
    schema,
    defaultValues: { reason: "", notes: "" },
    action: (v) => (isOpp ? markOpportunityLostAction({ id: ctx.id, reason: v.reason, notes: v.notes, alsoLead }) : markLeadLostAction({ id: ctx.id, reason: v.reason, notes: v.notes })),
    onSuccess: onClose,
    successMessage: isOpp ? "Oportunidad marcada como perdida" : "Lead marcado como perdido",
  });

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={isOpp ? "Cerrar oportunidad como perdida" : "Marcar lead como perdido"}
      description={ctx.name ? `${ctx.name} · el motivo alimenta los reportes de pérdidas.` : "El motivo alimenta los reportes de pérdidas."}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="lost-form" variant="destructive" loading={submitting} loadingText="Guardando…">
            Marcar como perdido
          </SubmitButton>
        </>
      }
    >
      <Form id="lost-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <SelectField
          name="reason"
          label="Motivo de pérdida"
          required
          placeholder="Selecciona un motivo"
          options={lossReasons.filter((r) => r.active).map((r) => ({ value: r.key, label: r.label }))}
          onValueChange={(v) => {
            if (isOpp && !touched) setAlsoLead(CLOSES_LEAD.has(v));
          }}
        />
        <TextareaField name="notes" label="Detalle (opcional)" rows={3} placeholder="¿Qué pasó? Esto ayuda a mejorar el proceso comercial." />
        {isOpp && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <Checkbox
              checked={alsoLead}
              onCheckedChange={(v) => {
                setTouched(true);
                setAlsoLead(v === true);
              }}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">También marcar el lead como perdido</span>
              <span className="block text-xs text-muted-foreground">Déjalo sin marcar si el cliente sigue buscando otra propiedad: el lead vuelve a «Calificado».</span>
            </span>
          </label>
        )}
      </Form>
    </AppDialog>
  );
}
