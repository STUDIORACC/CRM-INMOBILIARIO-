"use client";

import { updateCompanyAction } from "@/actions/settings";
import { Form, FormError, NumberField, SelectField, SubmitButton, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs } from "@/components/providers/app-context";
import { Panel } from "@/components/shared/panel";
import { CURRENCIES } from "@/lib/domain/constants";
import { companySchema } from "@/lib/validation/settings";

export function CompanyTab() {
  const { company } = useCatalogs();
  const { form, submit, formError, submitting } = useActionForm({
    schema: companySchema,
    defaultValues: {
      name: company.name,
      legalName: company.legalName ?? "",
      taxId: company.taxId ?? "",
      phone: company.phone ?? "",
      email: company.email ?? "",
      address: company.address ?? "",
      website: company.website ?? "",
      currency: company.currency,
      usdRate: company.usdRate,
    },
    action: updateCompanyAction,
    successMessage: "Datos de la empresa actualizados",
  });

  return (
    <Panel title="Datos de la empresa" description="Aparecen en documentos, plantillas de mensajes y reportes. El tipo de cambio convierte los montos en dólares en dashboard y reportes.">
      <Form form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Nombre comercial" required />
          <TextField name="legalName" label="Razón social" />
          <TextField name="taxId" label="RUC" inputMode="numeric" maxLength={11} />
          <TextField name="phone" label="Teléfono" inputMode="tel" />
          <TextField name="email" label="Correo de contacto" type="email" />
          <TextField name="website" label="Sitio web" placeholder="www.miinmobiliaria.pe" />
          <TextField name="address" label="Dirección" className="sm:col-span-2" />
          <SelectField name="currency" label="Moneda de reportes" required options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))} hint="Moneda en que se muestran los totales del dashboard." />
          <NumberField name="usdRate" label="Tipo de cambio (S/ por US$)" required hint="Se usa para convertir pipeline, cierres y presupuestos entre soles y dólares." />
        </div>
        <SubmitButton loading={submitting}>Guardar cambios</SubmitButton>
      </Form>
    </Panel>
  );
}
