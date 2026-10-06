"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { Loader2, Plus } from "lucide-react";
import { createPropertyAction, updatePropertyAction } from "@/actions/properties";
import { EntityField } from "@/components/forms/entity-field";
import { ChipsField, Form, FormError, NumberField, SelectField, SubmitButton, SwitchField, TextField, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCan, useCatalogs, useSession } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { Button } from "@/components/ui/button";
import { CURRENCIES, PROPERTY_FEATURES, PROPERTY_OPERATIONS, PROPERTY_STATUSES, PUBLICATION_STATUSES } from "@/lib/domain/constants";
import { propertySchema, type PropertyInput } from "@/lib/validation/properties";

export const EMPTY_PROPERTY: PropertyInput = {
  code: "",
  title: "",
  description: "",
  propertyType: "apartment",
  operation: "sale",
  price: null,
  currency: "PEN",
  minPrice: null,
  commissionPct: 3,
  district: "",
  province: "Lima",
  address: "",
  reference: "",
  latitude: null,
  longitude: null,
  totalArea: null,
  builtArea: null,
  bedrooms: null,
  bathrooms: null,
  parking: 0,
  ageYears: null,
  floor: null,
  elevator: false,
  furnished: false,
  features: [],
  status: "available",
  publicationStatus: "pending",
  ownerId: "",
  advisorId: "",
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function PropertyForm({ propertyId, initial, ownerLabel }: { propertyId?: string; initial?: PropertyInput; ownerLabel?: string }) {
  const router = useRouter();
  const session = useSession();
  const { users, propertyTypes, districts } = useCatalogs();
  const { open } = useQuickActions();
  const canReassign = useCan("properties.edit_any");
  const canFinancials = useCan("properties.financials");
  const editing = Boolean(propertyId);

  const { form, submit, formError, submitting } = useActionForm({
    schema: propertySchema,
    defaultValues: initial ?? { ...EMPTY_PROPERTY, advisorId: session.id, district: districts.find((d) => d.active)?.key ?? "" },
    action: (v) => (editing ? updatePropertyAction({ id: propertyId!, property: v }) : createPropertyAction(v)),
    onSuccess: (data) => {
      const r = data as { id?: string } | undefined;
      router.push(`/properties/${r?.id ?? propertyId}`);
    },
    successMessage: editing ? "Propiedad actualizada" : "Propiedad registrada: ahora agrega las fotos",
  });
  const currency = useWatch({ control: form.control, name: "currency" }) as "PEN" | "USD";
  const operation = useWatch({ control: form.control, name: "operation" }) as string;
  const type = useWatch({ control: form.control, name: "propertyType" }) as string;
  const symbol = currency === "USD" ? "US$" : "S/";
  const land = type === "land";

  return (
    <Form form={form} onSubmit={submit} className="space-y-5">
      <FormError message={formError} />

      <Section title="Datos generales" description="Lo esencial para identificar y publicar el inmueble.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField name="title" label="Título de la publicación" required placeholder="Ej. Departamento moderno en San Miguel" className="sm:col-span-2 lg:col-span-2" />
          <TextField name="code" label="Código interno" placeholder="Automático (ej. SM-025)" hint={editing ? undefined : "Déjalo vacío para generarlo según el distrito"} />
          <SelectField name="propertyType" label="Tipo de inmueble" required options={propertyTypes.filter((t) => t.active).map((t) => ({ value: t.key, label: t.label }))} />
          <SelectField name="operation" label="Operación" required options={PROPERTY_OPERATIONS.map((o) => ({ value: o.value, label: o.label }))} />
          <SelectField name="currency" label="Moneda" required options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))} />
          <NumberField name="price" label={operation === "rent" ? "Renta mensual" : "Precio de venta"} required prefix={symbol} />
          <SelectField name="status" label="Estado comercial" options={PROPERTY_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
          <SelectField name="publicationStatus" label="Estado de publicación" options={PUBLICATION_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
        </div>
      </Section>

      <Section title="Características">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField name="totalArea" label="Área total" suffix="m²" />
          {!land && <NumberField name="builtArea" label="Área construida" suffix="m²" />}
          {!land && <NumberField name="bedrooms" label="Dormitorios" allowDecimals={false} />}
          {!land && <NumberField name="bathrooms" label="Baños" allowDecimals={false} />}
          <NumberField name="parking" label="Estacionamientos" allowDecimals={false} />
          {!land && <NumberField name="ageYears" label="Antigüedad (años)" allowDecimals={false} hint="0 = estreno" />}
          {!land && <NumberField name="floor" label="Piso" allowDecimals={false} />}
        </div>
        {!land && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SwitchField name="elevator" label="Ascensor" />
            <SwitchField name="furnished" label="Amoblado" />
          </div>
        )}
        <div className="mt-4">
          <ChipsField name="features" label="Amenities y extras" options={PROPERTY_FEATURES.map((f) => ({ value: f.value, label: f.label }))} />
        </div>
      </Section>

      <Section title="Ubicación" description="Con latitud y longitud se muestra el mapa en la ficha.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField name="district" label="Distrito" required options={districts.filter((d) => d.active).map((d) => ({ value: d.key, label: d.label }))} />
          <TextField name="province" label="Provincia" required />
          <TextField name="address" label="Dirección" placeholder="Av. La Marina 2450" />
          <TextField name="reference" label="Referencia" placeholder="Cerca al Parque de las Leyendas" className="sm:col-span-2 lg:col-span-3" />
          <NumberField name="latitude" label="Latitud" placeholder="-12.077000" hint="Ej. -12.0770" />
          <NumberField name="longitude" label="Longitud" placeholder="-77.083000" hint="Ej. -77.0830" />
        </div>
      </Section>

      <Section title="Gestión comercial">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="advisorId" label="Asesor responsable" options={users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))} disabled={!canReassign && session.role === "advisor"} />
          <div className="space-y-1.5">
            <EntityField name="ownerId" kind="owner" label="Propietario" initialLabel={ownerLabel} />
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => open("owner", {})}>
              <Plus className="size-3" /> ¿No está? Registra un propietario nuevo (luego búscalo aquí)
            </Button>
          </div>
          {canFinancials && <NumberField name="commissionPct" label="Comisión" suffix="%" />}
          {canFinancials && <NumberField name="minPrice" label="Precio mínimo negociable" prefix={symbol} hint="Uso interno" />}
        </div>
      </Section>

      <Section title="Descripción">
        <TextareaField name="description" rows={6} placeholder="Describe distribución, estado, entorno y ventajas competitivas…" maxLength={3000} />
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <Button variant="outline" asChild disabled={submitting}>
          <Link href={editing ? `/properties/${propertyId}` : "/properties"}>Cancelar</Link>
        </Button>
        <SubmitButton loading={submitting}>{editing ? "Guardar cambios" : "Registrar propiedad"}</SubmitButton>
      </div>
      <span className="hidden">{submitting && <Loader2 />}</span>
    </Form>
  );
}
