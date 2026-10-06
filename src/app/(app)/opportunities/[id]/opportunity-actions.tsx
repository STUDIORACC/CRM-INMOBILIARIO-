"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, CheckSquare, Pencil, StickyNote, Trash2, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { deleteOpportunityAction, moveOpportunityAction, updateOpportunityAction } from "@/actions/opportunities";
import { Form, FormError, FieldShell, NumberField, SelectField, SubmitButton, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCan, useCatalogs } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { AppDialog, ConfirmDialog } from "@/components/shared/app-dialog";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { Button } from "@/components/ui/button";
import { PRIORITIES } from "@/lib/domain/constants";
import type { OpportunityRow } from "@/lib/services/opportunities";
import { PROBABILITY_VALUES, updateOpportunitySchema } from "@/lib/validation/opportunities";
import { cn } from "@/lib/utils";
import { Controller, useFormContext } from "react-hook-form";

interface Props {
  opp: OpportunityRow & { lead_phone: string | null; client_phone: string | null; lead_email: string | null; client_email: string | null };
  closed: boolean;
}

export function OpportunityActions({ opp, closed }: Props) {
  const { open } = useQuickActions();
  const router = useRouter();
  const canDelete = useCan("opportunities.delete");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const label = `${opp.party_name} · ${opp.property_code}`;
  const ctx = { opportunityId: opp.id, leadId: opp.lead_id ?? undefined, clientId: opp.client_id ?? undefined, propertyId: opp.property_id, propertyLabel: `${opp.property_code} · ${opp.property_title}`, leadName: opp.party_name, clientName: opp.party_name };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!closed && (
        <>
          <Button onClick={() => open("won", { opportunityId: opp.id, name: label, value: opp.value, currency: opp.currency })} className="bg-emerald-600 hover:bg-emerald-600/90">
            <Trophy /> Cerrar como ganada
          </Button>
          <Button variant="outline" onClick={() => open("lost", { entity: "opportunity", id: opp.id, name: label })}>
            <XCircle /> Marcar perdida
          </Button>
        </>
      )}
      <Button variant="outline" onClick={() => open("task", ctx)}>
        <CheckSquare /> Tarea
      </Button>
      <Button variant="outline" onClick={() => open("visit", ctx)}>
        <CalendarPlus /> Visita
      </Button>
      <Button variant="outline" onClick={() => open("activity", { ...ctx, type: "call" })}>
        <StickyNote /> Actividad
      </Button>
      <ContactButtons phone={opp.lead_phone ?? opp.client_phone} email={opp.lead_email ?? opp.client_email} name={opp.party_name} leadId={opp.lead_id ?? undefined} clientId={opp.client_id ?? undefined} opportunityId={opp.id} propertyId={opp.property_id} propertyLabel={`${opp.property_code} · ${opp.property_title}`} size="default" />
      {!closed && (
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Editar oportunidad">
          <Pencil />
        </Button>
      )}
      {canDelete && (
        <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Eliminar oportunidad">
          <Trash2 className="text-destructive" />
        </Button>
      )}
      {editing && <EditDialog opp={opp} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar la oportunidad?"
        description="Se eliminará junto con sus tareas y notas. Las visitas se conservan sin vínculo. No se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          const res = await deleteOpportunityAction({ id: opp.id });
          if (res.ok) {
            toast.success(res.message);
            router.push("/opportunities");
          }
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      />
    </div>
  );
}

function ProbabilityPicker() {
  const { control } = useFormContext();
  return (
    <FieldShell name="probability" label="Probabilidad de cierre" required>
      <Controller
        control={control}
        name="probability"
        render={({ field }) => (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Probabilidad">
            {PROBABILITY_VALUES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={field.value === p} onClick={() => field.onChange(p)} className={cn("min-w-14 rounded-lg border px-3 py-1.5 text-sm font-medium tabular", field.value === p ? "border-primary bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-accent")}>
                {p}%
              </button>
            ))}
          </div>
        )}
      />
    </FieldShell>
  );
}

function EditDialog({ opp, onClose }: { opp: Props["opp"]; onClose: () => void }) {
  const { users } = useCatalogs();
  const canReassign = useCan("opportunities.reassign");
  const { form, submit, formError, submitting } = useActionForm({
    schema: updateOpportunitySchema.omit({ id: true }),
    defaultValues: {
      value: opp.value,
      probability: opp.probability as 10,
      priority: opp.priority as "low",
      expectedCloseDate: opp.expected_close_date ?? "",
      nextStep: opp.next_step ?? "",
      assignedTo: opp.assigned_to,
    },
    action: (v) => updateOpportunityAction({ ...v, id: opp.id }),
    onSuccess: onClose,
    successMessage: "Oportunidad actualizada",
  });
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Editar oportunidad"
      description={`${opp.party_name} · ${opp.property_code}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="opp-edit" loading={submitting}>
            Guardar cambios
          </SubmitButton>
        </>
      }
    >
      <Form id="opp-edit" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <NumberField name="value" label="Valor estimado" required prefix={opp.currency === "USD" ? "US$" : "S/"} />
        <ProbabilityPicker />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="priority" label="Prioridad" options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
          <TextField name="expectedCloseDate" label="Fecha estimada de cierre" type="date" />
        </div>
        <TextField name="nextStep" label="Próximo paso" />
        {canReassign && <SelectField name="assignedTo" label="Vendedor responsable" options={users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))} />}
      </Form>
    </AppDialog>
  );
}

/** Barra de etapas: un clic mueve la oportunidad (con confirmación para cierre ganado/perdido). */
export function StageStepper({ opp, stages }: { opp: Pick<OpportunityRow, "id" | "stage" | "party_name" | "property_code" | "value" | "currency">; stages: Array<{ key: string; label: string; kind: string; color: string }> }) {
  const { open } = useQuickActions();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const openStages = stages.filter((s) => s.kind === "open");
  const current = stages.find((s) => s.key === opp.stage);
  const idx = openStages.findIndex((s) => s.key === opp.stage);
  const closed = current?.kind !== "open";

  const go = async (key: string) => {
    if (key === opp.stage || busy) return;
    setBusy(key);
    const res = await moveOpportunityAction({ id: opp.id, stage: key });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message);
    router.refresh();
  };

  return (
    <nav aria-label="Etapas de la oportunidad" className="overflow-x-auto rounded-xl border bg-card p-3 shadow-card">
      <ol className="flex min-w-max items-center gap-1">
        {openStages.map((s, i) => {
          const done = closed ? current?.kind === "won" : idx > i;
          const active = !closed && idx === i;
          return (
            <li key={s.key} className="flex items-center gap-1">
              <button
                type="button"
                disabled={closed}
                onClick={() => go(s.key)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-default",
                  active ? "text-white shadow-sm" : done ? "bg-muted text-foreground hover:bg-muted/70" : "text-muted-foreground hover:bg-muted",
                  busy === s.key && "opacity-60",
                )}
                style={active ? { backgroundColor: s.color } : undefined}
              >
                <span className={cn("flex size-4 items-center justify-center rounded-full text-[10px] font-bold", active ? "bg-white/25" : done ? "bg-emerald-500 text-white" : "bg-muted-foreground/15")}>{done ? "✓" : i + 1}</span>
                {s.label}
              </button>
              {i < openStages.length - 1 && <span className="h-px w-3 bg-border" />}
            </li>
          );
        })}
        <li className="ml-2 flex items-center gap-1 border-l pl-3">
          {closed ? (
            <span className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold", current?.kind === "won" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{current?.label}</span>
          ) : (
            <>
              <button type="button" onClick={() => open("won", { opportunityId: opp.id, name: `${opp.party_name} · ${opp.property_code}`, value: opp.value, currency: opp.currency })} className="rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-emerald-700 hover:bg-emerald-50">
                Ganada
              </button>
              <button type="button" onClick={() => open("lost", { entity: "opportunity", id: opp.id, name: `${opp.party_name} · ${opp.property_code}` })} className="rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-rose-700 hover:bg-rose-50">
                Perdida
              </button>
            </>
          )}
        </li>
      </ol>
    </nav>
  );
}
