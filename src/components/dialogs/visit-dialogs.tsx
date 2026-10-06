"use client";

import { addDays, setHours, setMinutes } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { getVisitForDialogAction } from "@/actions/queries";
import { cancelVisitAction, completeVisitAction, createVisitAction, rescheduleVisitAction } from "@/actions/visits";
import { EntityCombobox, EntityField } from "@/components/forms/entity-field";
import { FieldShell, Form, FormError, SelectField, SubmitButton, SwitchField, TextField, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs, useSession } from "@/components/providers/app-context";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { VISIT_OUTCOMES } from "@/lib/domain/constants";
import { fmtDateTime, toInputDateTime, tz } from "@/lib/domain/dates";
import type { VisitConflict, VisitRow } from "@/lib/services/visits";
import { cancelVisitSchema, completeVisitSchema, visitSchema, type VisitInput } from "@/lib/validation/visits";
import { cn } from "@/lib/utils";

const DURATIONS = [30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }));

function DurationField() {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name="durationMin"
      render={({ field }) => (
        <FieldShell name="durationMin" label="Duración">
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button key={d.value} type="button" onClick={() => field.onChange(Number(d.value))} className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium tabular", Number(field.value) === Number(d.value) ? "border-primary bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-accent")}>
                {d.label}
              </button>
            ))}
          </div>
        </FieldShell>
      )}
    />
  );
}

/** Agendar / reprogramar visita. */
export function VisitDialog({ ctx, onClose }: DialogProps<"visit">) {
  const [loading, setLoading] = useState(Boolean(ctx.visitId));
  const [existing, setExisting] = useState<VisitRow | null>(null);
  useEffect(() => {
    if (!ctx.visitId) return;
    getVisitForDialogAction({ id: ctx.visitId }).then((r) => {
      if (r.ok) setExisting(r.data);
      else {
        toast.error("No se pudo cargar la visita");
        onClose();
      }
      setLoading(false);
    });
  }, [ctx.visitId, onClose]);
  if (loading) {
    return (
      <AppDialog open onOpenChange={(o) => !o && onClose()} title="Reprogramar visita">
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      </AppDialog>
    );
  }
  return <VisitForm ctx={ctx} existing={existing} onClose={onClose} />;
}

function VisitForm({ ctx, existing, onClose }: { ctx: DialogProps<"visit">["ctx"]; existing: VisitRow | null; onClose: () => void }) {
  const session = useSession();
  const { users } = useCatalogs();
  const reschedule = Boolean(existing);
  const [conflict, setConflict] = useState<VisitConflict[] | null>(null);
  const [chip, setChip] = useState<string | null>(null);
  const [party, setParty] = useState<string>(existing ? (existing.lead_id ? `lead:${existing.lead_id}` : `client:${existing.client_id}`) : ctx.leadId ? `lead:${ctx.leadId}` : ctx.clientId ? `client:${ctx.clientId}` : "");
  const locked = Boolean(existing || ctx.leadId || ctx.clientId);
  const now = tz();
  const at = (days: number, h: number, m = 0) => setMinutes(setHours(addDays(now, days), h), m);

  const { form, submit, formError, submitting } = useActionForm({
    schema: visitSchema,
    defaultValues: {
      leadId: existing?.lead_id ?? ctx.leadId ?? "",
      clientId: existing?.client_id ?? ctx.clientId ?? "",
      propertyId: existing?.property_id ?? ctx.propertyId ?? "",
      opportunityId: existing?.opportunity_id ?? ctx.opportunityId ?? "",
      advisorId: existing?.advisor_id ?? (session.role === "assistant" ? "" : session.id),
      scheduledAt: existing ? "" : toInputDateTime(at(1, 10).toISOString()),
      durationMin: existing?.duration_min ?? 45,
      observations: existing?.observations ?? "",
      force: false,
      rescheduleOf: "",
    } as VisitInput,
    action: (v) => (existing ? rescheduleVisitAction({ ...v, visitId: existing.id }) : createVisitAction(v)),
    onFailure: (res) => {
      if (res.code === "conflict") {
        setConflict(res.details as VisitConflict[]);
        form.setError("scheduledAt", { message: res.error });
        return true;
      }
      return false;
    },
    onSuccess: () => onClose(),
    successMessage: reschedule ? "Visita reprogramada" : "Visita agendada",
  });
  const scheduledAt = useWatch({ control: form.control, name: "scheduledAt" }) as string;
  // El aviso de conflicto deja de valer en cuanto cambia la hora (ajuste de estado durante el render)
  const [conflictFor, setConflictFor] = useState(scheduledAt);
  if (conflictFor !== scheduledAt) {
    setConflictFor(scheduledAt);
    setConflict(null);
  }

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={reschedule ? "Reprogramar visita" : "Agendar visita"}
      description={reschedule ? `La visita original quedará como "Reprogramada" y se creará una nueva (${fmtDateTime(existing!.scheduled_at)} → nueva fecha).` : "La visita aparecerá en el calendario del asesor y avanzará la oportunidad en el pipeline."}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {conflict && (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                form.setValue("force", true);
                form.clearErrors("scheduledAt");
                void submit();
              }}
            >
              Agendar de todos modos
            </Button>
          )}
          <SubmitButton form="visit-form" loading={submitting}>
            {reschedule ? "Reprogramar" : "Agendar visita"}
          </SubmitButton>
        </>
      }
    >
      <Form id="visit-form" form={form} onSubmit={(e) => { form.setValue("force", false); return submit(e); }} className="space-y-4">
        <FormError message={formError} />
        <FieldShell name="leadId" label="Lead o cliente" required>
          <EntityCombobox
            kind="party"
            value={party}
            disabled={locked}
            initialLabel={existing?.party_name ?? ctx.leadName ?? ctx.clientName}
            onChange={(id) => {
              setParty(id);
              const [kind, uuid] = id.split(":");
              form.setValue("leadId", kind === "lead" ? uuid : "", { shouldValidate: true });
              form.setValue("clientId", kind === "client" ? uuid : "", { shouldValidate: true });
            }}
          />
        </FieldShell>
        <EntityField name="propertyId" kind="property" label="Propiedad a visitar" required initialLabel={existing ? `${existing.property_code} · ${existing.property_title}` : ctx.propertyLabel} filters={{ status: "available" }} />

        <div className="space-y-2">
          <TextField name="scheduledAt" label="Fecha y hora" type="datetime-local" required />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["Hoy 5 p. m.", at(0, 17)],
                ["Mañana 10 a. m.", at(1, 10)],
                ["Mañana 4 p. m.", at(1, 16)],
                ["En 2 días 11 a. m.", at(2, 11)],
                ["En 3 días 4 p. m.", at(3, 16)],
              ] as Array<[string, Date]>
            ).map(([label, d]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setChip(label);
                  form.setValue("scheduledAt", toInputDateTime(d.toISOString()), { shouldValidate: true, shouldDirty: true });
                }}
                className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", chip === label ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground hover:bg-accent")}
              >
                {label}
              </button>
            ))}
          </div>
          {conflict && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <b>Choque de agenda.</b> El asesor ya tiene {conflict.length === 1 ? "una visita" : `${conflict.length} visitas`} en ese horario:
                <ul className="mt-1 list-disc pl-4">
                  {conflict.map((c) => (
                    <li key={c.id}>
                      {c.property_code} con {c.party_name} · {fmtDateTime(c.scheduled_at)} ({c.duration_min} min)
                    </li>
                  ))}
                </ul>
                Elige otra hora o agenda igualmente si es intencional.
              </div>
            </div>
          )}
        </div>
        <DurationField />
        <SelectField name="advisorId" label="Asesor que atenderá" required placeholder="Selecciona un asesor" options={users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))} disabled={session.role === "advisor"} />
        <TextareaField name="observations" label="Observaciones (opcional)" rows={2} placeholder="Acceso, llaves, quién asistirá…" />
      </Form>
    </AppDialog>
  );
}

const resultSchema = completeVisitSchema.omit({ id: true });

/** Registrar el resultado de una visita realizada (obligatorio para cerrarla). */
export function VisitResultDialog({ ctx, onClose }: DialogProps<"visit-result">) {
  const { form, submit, formError, submitting } = useActionForm({
    schema: resultSchema,
    defaultValues: { outcome: "" as never, notes: "", followUp: true, followUpAt: "" },
    action: (v) => completeVisitAction({ ...v, id: ctx.visitId }),
    onSuccess: onClose,
    successMessage: "Resultado registrado",
  });
  const outcome = useWatch({ control: form.control, name: "outcome" }) as string;
  const followUp = useWatch({ control: form.control, name: "followUp" }) as boolean;

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Resultado de la visita"
      description={[ctx.partyName, ctx.propertyLabel].filter(Boolean).join(" · ") || "Registrar cómo fue la visita"}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="visit-result-form" loading={submitting}>
            Registrar resultado
          </SubmitButton>
        </>
      }
    >
      <Form id="visit-result-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <Controller
          control={form.control}
          name="outcome"
          render={({ field, fieldState }) => (
            <FieldShell name="outcome" label="¿Cómo fue la visita?" required>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Resultado">
                {VISIT_OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={field.value === o.value}
                    onClick={() => field.onChange(o.value)}
                    className={cn("rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors", field.value === o.value ? "border-primary bg-primary/10 text-primary" : "bg-white hover:bg-accent", fieldState.error && "border-destructive/50")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </FieldShell>
          )}
        />
        {outcome === "wants_other" && <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">Tip: desde la ficha del lead puedes ver propiedades compatibles y agendar otra visita en un clic.</p>}
        {outcome === "not_interested" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">Si el cliente descarta la propiedad, cierra la oportunidad indicando el motivo para alimentar los reportes.</p>}
        <TextareaField name="notes" label="Nota del asesor" required rows={4} placeholder="Reacciones del cliente, objeciones, próximos pasos acordados…" />
        <SwitchField name="followUp" label="Crear tarea de seguimiento" hint="Se programará por defecto para mañana a las 10:00" />
        {followUp && <TextField name="followUpAt" label="Fecha del seguimiento (opcional)" type="datetime-local" />}
      </Form>
    </AppDialog>
  );
}

const cancelSchema = z.object({ mode: cancelVisitSchema.shape.mode, reason: z.string().trim().max(300).optional() });

/** Cancelar una visita o registrar que el cliente no asistió. */
export function VisitCancelDialog({ ctx, onClose }: DialogProps<"visit-cancel">) {
  const { form, submit, formError, submitting } = useActionForm({
    schema: cancelSchema,
    defaultValues: { mode: "cancelled" as const, reason: "" },
    action: (v) => cancelVisitAction({ ...v, id: ctx.visitId }),
    onSuccess: onClose,
  });
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Cancelar visita"
      description={[ctx.partyName, ctx.propertyLabel].filter(Boolean).join(" · ")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Volver
          </Button>
          <SubmitButton form="visit-cancel-form" variant="destructive" loading={submitting}>
            Confirmar
          </SubmitButton>
        </>
      }
    >
      <Form id="visit-cancel-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <SelectField
          name="mode"
          label="Motivo"
          options={[
            { value: "cancelled", label: "Cancelada (avisó con anticipación)" },
            { value: "no_show", label: "No asistió" },
          ]}
        />
        <TextareaField name="reason" label="Detalle (opcional)" rows={3} placeholder="¿Qué ocurrió? Puedes reprogramar luego desde el historial." />
      </Form>
    </AppDialog>
  );
}
