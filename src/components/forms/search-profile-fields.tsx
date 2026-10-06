"use client";

import { useWatch } from "react-hook-form";
import { useCatalogs } from "@/components/providers/app-context";
import { CURRENCIES, FINANCING, OPERATION_TYPES } from "@/lib/domain/constants";
import { MultiSelectField, NumberField, SelectField } from "./fields";

/** Calificación / preferencias de búsqueda (compartida por leads y clientes; alimenta el matching). */
export function SearchProfileFields() {
  const { propertyTypes, districts } = useCatalogs();
  const currency = useWatch({ name: "currency" }) as "PEN" | "USD";
  const symbol = currency === "USD" ? "US$" : "S/";
  const operation = useWatch({ name: "operationType" }) as string;
  const rent = operation === "rent";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="operationType" label="Tipo de operación" options={OPERATION_TYPES.map((o) => ({ value: o.value, label: o.label }))} allowEmpty emptyLabel="Sin definir" />
        <SelectField name="propertyType" label="Tipo de inmueble" options={propertyTypes.filter((t) => t.active).map((t) => ({ value: t.key, label: t.label }))} allowEmpty emptyLabel="Sin definir" />
      </div>
      <MultiSelectField name="districts" label="Distritos de interés" options={districts.filter((d) => d.active).map((d) => ({ value: d.key, label: d.label }))} placeholder="Selecciona uno o más distritos" />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField name="currency" label="Moneda" options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))} />
        <NumberField name="budgetMin" label={rent ? "Renta mínima (mensual)" : "Presupuesto mínimo"} prefix={symbol} placeholder="0" />
        <NumberField name="budgetMax" label={rent ? "Renta máxima (mensual)" : "Presupuesto máximo"} prefix={symbol} placeholder="0" />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <NumberField name="bedroomsMin" label="Habitaciones (mín.)" allowDecimals={false} placeholder="0" />
        <NumberField name="bathroomsMin" label="Baños (mín.)" allowDecimals={false} placeholder="0" />
        <NumberField name="areaMin" label="Área mínima" suffix="m²" placeholder="0" />
        <NumberField name="areaMax" label="Área máxima" suffix="m²" placeholder="0" />
      </div>
      <SelectField name="financing" label="Financiamiento" options={FINANCING.map((f) => ({ value: f.value, label: f.label }))} allowEmpty emptyLabel="Sin definir" />
    </div>
  );
}
