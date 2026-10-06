"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { createOpportunityAction } from "@/actions/opportunities";
import { EntityCombobox, EntityField } from "@/components/forms/entity-field";
import { FieldShell, Form, FormError, NumberField, SelectField, SubmitButton, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs, useSession } from "@/components/providers/app-context";
import { MatchSuggestions } from "@/components/matching/match-suggestions";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { CURRENCIES, PRIORITIES } from "@/lib/domain/constants";
import { opportunitySchema, PROBABILITY_VALUES, type OpportunityInput } from "@/lib/validation/opportunities";
import { Controller, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";

function ProbabilityField() {
  const { control } = useFormContext();
  return (
    <FieldShell name="probability" label="Probabilidad de cierre" required hint="Se usa para calcular el pipeline ponderado">
      <Controller
        control={control}
        name="probability"
        render={({ field }) => (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Probabilidad">
            {PROBABILITY_VALUES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={field.value === p}
                onClick={() => field.onChange(p)}
                className={cn("min-w-14 rounded-lg border px-3 py-1.5 text-sm font-medium tabular transition-colors", field.value === p ? "border-primary bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-accent")}
              >
                {p}%
              </button>
            ))}
          </div>
        )}
      />
    </FieldShell>
  );
}

export default function OpportunityDialog({ ctx, onClose }: DialogProps<"opportunity">) {
  const router = useRouter();
  const session = useSession();
  const { stages, users } = useCatalogs();
  const openStages = stages.filter((s) => s.kind === "open");
  const [party, setParty] = useState<string>(ctx.leadId ? `lead:${ctx.leadId}` : ctx.clientId ? `client:${ctx.clientId}` : "");

  const { form, submit, formError, submitting } = useActionForm({
    schema: opportunitySchema,
    defaultValues: {
      leadId: ctx.leadId ?? "",
      clientId: ctx.clientId ?? "",
      propertyId: ctx.propertyId ?? "",
      assignedTo: session.id,
      stage: "qualified",
      value: null,
      currency: "PEN",
      probability: 25,
      priority: "medium",
      expectedCloseDate: "",
      nextStep: "",
    } as OpportunityInput,
    action: createOpportunityAction,
    successMessage: "Oportunidad creada",
    onSuccess: (data) => {
      onClose();
      router.push(`/opportunities/${data.id}`);
    },
  });

  const leadId = useWatch({ control: form.control, name: "leadId" }) as string;
  const clientId = useWatch({ control: form.control, name: "clientId" }) as string;
  const propertyId = useWatch({ control: form.control, name: "propertyId" }) as string;
  const currency = useWatch({ control: form.control, name: "currency" }) as "PEN" | "USD";
  const stage = useWatch({ control: form.control, name: "stage" }) as string;
  const partyLocked = Boolean(ctx.leadId || ctx.clientId);

  const choosePrice = (meta?: Record<string, string | number | null>) => {
    if (!meta || typeof meta.price !== "number") return;
    const monthly = meta.operation === "rent";
    form.setValue("value", monthly ? meta.price * 12 : meta.price, { shouldValidate: true, shouldDirty: true });
    form.setValue("currency", (meta.currency as "PEN" | "USD") ?? "PEN");
  };

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="Nueva oportunidad"
      description="Une a la persona interesada con una propiedad y empieza a seguir el negocio en el pipeline."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="opp-form" loading={submitting}>
            Crear oportunidad
          </SubmitButton>
        </>
      }
    >
      <Form id="opp-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <FieldShell name="leadId" label="Lead o cliente" required>
          <EntityCombobox
            kind="party"
            value={party}
            disabled={partyLocked}
            initialLabel={ctx.leadName ?? ctx.clientName}
            onChange={(id) => {
              setParty(id);
              const [kind, uuid] = id.split(":");
              form.setValue("leadId", kind === "lead" ? uuid : "", { shouldValidate: true });
              form.setValue("clientId", kind === "client" ? uuid : "", { shouldValidate: true });
            }}
          />
        </FieldShell>

        <EntityField name="propertyId" kind="property" label="Propiedad" required initialLabel={ctx.propertyLabel} filters={{ status: "available", operation: ctx.operation }} onSelect={(it) => it && choosePrice(it.meta)} />
        {!propertyId && (leadId || clientId) && (
          <MatchSuggestions
            leadId={leadId || undefined}
            clientId={clientId || undefined}
            compact
            onPick={(p) => {
              form.setValue("propertyId", p.id, { shouldValidate: true });
              choosePrice({ price: p.price, currency: p.currency, operation: p.operation });
            }}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField name="currency" label="Moneda" options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))} />
          <NumberField name="value" label="Valor estimado" required prefix={currency === "USD" ? "US$" : "S/"} hint="Alquileres: valor del contrato a 12 meses" className="sm:col-span-2" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="stage"
            label="Etapa inicial"
            required
            options={openStages.map((s) => ({ value: s.key, label: s.label }))}
            onValueChange={(k) => {
              const s = stages.find((x) => x.key === k);
              if (s) form.setValue("probability", (s.defaultProbability as 10) ?? 25, { shouldDirty: true });
            }}
          />
          <SelectField name="assignedTo" label="Vendedor responsable" required options={users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))} disabled={session.role === "advisor"} />
        </div>
        <ProbabilityField />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="priority" label="Prioridad" options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
          <TextField name="expectedCloseDate" label="Fecha estimada de cierre" type="date" />
        </div>
        <TextField name="nextStep" label="Próximo paso" placeholder="Ej. Coordinar visita con el cliente y su esposa" />
        <input type="hidden" value={stage} readOnly />
      </Form>
    </AppDialog>
  );
}
