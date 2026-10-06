"use client";

import { useRouter } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { winOpportunityAction } from "@/actions/opportunities";
import { Form, FormError, NumberField, SubmitButton, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { winOpportunitySchema } from "@/lib/validation/opportunities";

/** Confirma el cierre ganado con el valor final de la operación. */
export default function WonDialog({ ctx, onClose }: DialogProps<"won">) {
  const router = useRouter();
  const { form, submit, formError, submitting } = useActionForm({
    schema: winOpportunitySchema.omit({ id: true }),
    defaultValues: { value: ctx.value ?? null, notes: "" },
    action: (v) => winOpportunityAction({ ...v, id: ctx.opportunityId }),
    onSuccess: (data) => {
      onClose();
      if (data.clientId) router.refresh();
    },
    successMessage: "¡Operación cerrada! La propiedad y las métricas se actualizaron.",
  });
  const symbol = ctx.currency === "USD" ? "US$" : "S/";
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Cerrar como ganada"
      description={ctx.name ? `${ctx.name}` : "Confirma el valor final de la operación."}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="won-form" loading={submitting} loadingText="Cerrando…">
            <PartyPopper /> Confirmar cierre
          </SubmitButton>
        </>
      }
    >
      <Form id="won-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <NumberField name="value" label="Valor final de la operación" required prefix={symbol} hint="Se registra como venta cerrada y alimenta los reportes" />
        <TextareaField name="notes" label="Notas del cierre (opcional)" rows={3} placeholder="Condiciones, forma de pago, fecha de firma…" />
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>La propiedad pasará a Vendida / Alquilada.</li>
          <li>El lead se convierte en cliente (si aún no lo era).</li>
          <li>Otras oportunidades abiertas sobre esta propiedad se cerrarán.</li>
        </ul>
      </Form>
    </AppDialog>
  );
}
