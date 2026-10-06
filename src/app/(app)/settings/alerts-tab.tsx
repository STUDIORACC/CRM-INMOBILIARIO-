"use client";

import { saveNotifySettingsAction } from "@/actions/settings";
import { Form, FormError, NumberField, SubmitButton, SwitchField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs } from "@/components/providers/app-context";
import { Panel } from "@/components/shared/panel";
import { NOTIFY_KEYS, notifySchema } from "@/lib/validation/settings";

const NOTIFY_LABELS: Record<(typeof NOTIFY_KEYS)[number], { label: string; hint: string }> = {
  new_lead_assigned: { label: "Lead asignado", hint: "Avisa al vendedor cuando se le asigna un lead nuevo." },
  follow_up_overdue: { label: "Seguimiento vencido", hint: "Llamadas, WhatsApp y seguimientos de leads que pasaron su fecha." },
  task_overdue: { label: "Tarea vencida", hint: "Tareas pendientes que no se completaron a tiempo." },
  visit_upcoming: { label: "Visita próxima", hint: "Recordatorio de visitas dentro de las próximas 24 horas." },
  visit_cancelled: { label: "Visita cancelada", hint: "Avisa al asesor cuando se cancela o reprograma una visita." },
  opportunity_stalled: { label: "Oportunidad detenida", hint: "Oportunidades abiertas sin movimiento por varios días." },
  opportunity_new: { label: "Oportunidad nueva", hint: "Avisa a la gerencia cuando se crea una oportunidad." },
  property_reserved: { label: "Propiedad reservada", hint: "Avisa a la gerencia cuando una propiedad pasa a reservada." },
  new_client: { label: "Cliente nuevo", hint: "Avisa a la gerencia cuando un lead se convierte en cliente." },
};

export function AlertsTab() {
  const { company } = useCatalogs();
  const { form, submit, formError, submitting } = useActionForm({
    schema: notifySchema,
    defaultValues: {
      alertLeadIdleDays: company.alertLeadIdleDays,
      alertOpportunityDays: company.alertOpportunityDays,
      alertClientIdleDays: company.alertClientIdleDays,
      alertFirstResponseH: company.alertFirstResponseH,
      notify: Object.fromEntries(NOTIFY_KEYS.map((k) => [k, company.notifySettings[k] !== false])),
    },
    action: saveNotifySettingsAction,
    successMessage: "Preferencias de alertas guardadas",
  });

  return (
    <Form form={form} onSubmit={submit} className="space-y-4">
      <FormError message={formError} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Umbrales de alerta" description="Definen cuándo un lead, oportunidad o cliente se considera desatendido. Alimentan los chips de alerta y el dashboard.">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField name="alertFirstResponseH" label="Primer contacto (horas)" allowDecimals={false} required hint="Un lead nuevo sin contactar pasado este tiempo genera alerta." />
            <NumberField name="alertLeadIdleDays" label="Lead sin actividad (días)" allowDecimals={false} required />
            <NumberField name="alertOpportunityDays" label="Oportunidad sin movimiento (días)" allowDecimals={false} required />
            <NumberField name="alertClientIdleDays" label="Cliente sin contacto (días)" allowDecimals={false} required />
          </div>
        </Panel>
        <Panel title="Notificaciones internas" description="Activa o desactiva cada tipo de aviso para todo el equipo.">
          <div className="space-y-2">
            {NOTIFY_KEYS.map((k) => (
              <SwitchField key={k} name={`notify.${k}`} label={NOTIFY_LABELS[k].label} hint={NOTIFY_LABELS[k].hint} />
            ))}
          </div>
        </Panel>
      </div>
      <SubmitButton loading={submitting}>Guardar preferencias</SubmitButton>
    </Form>
  );
}
