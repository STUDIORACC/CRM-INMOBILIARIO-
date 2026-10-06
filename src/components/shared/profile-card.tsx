import { Pencil } from "lucide-react";
import { FINANCING, INTEREST_LEVELS, OPERATION_TYPES, labelOf, type Currency } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import { formatArea, formatMoney } from "@/lib/domain/money";
import type { Lookups } from "@/lib/types/catalogs";
import { EditButton } from "./edit-button";

export interface ProfileData {
  operation_type: string | null;
  property_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: Currency;
  districts: string[];
  bedrooms_min: number | null;
  bathrooms_min: number | null;
  area_min: number | null;
  area_max: number | null;
  financing: string | null;
  purchase_date: string | null;
  interest_level?: string | null;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-baseline gap-2 py-1.5 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  );
}

const dash = <span className="font-normal text-muted-foreground">—</span>;

/** Calificación / preferencias de búsqueda (lead o cliente). */
export function ProfileCard({ profile, lookups, editKind, editCtx, title = "Calificación" }: { profile: ProfileData; lookups: Lookups; editKind: "lead" | "client"; editCtx: Record<string, string>; title?: string }) {
  const p = profile;
  const rent = p.operation_type === "rent";
  const budget = p.budget_min != null || p.budget_max != null ? `${p.budget_min != null ? formatMoney(p.budget_min, p.currency) : "—"} – ${p.budget_max != null ? formatMoney(p.budget_max, p.currency) : "—"}${rent ? " /mes" : ""}` : null;
  const area = p.area_min != null || p.area_max != null ? `${p.area_min != null ? formatArea(p.area_min) : "—"} – ${p.area_max != null ? formatArea(p.area_max) : "—"}` : null;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-card">
      <header className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <EditButton kind={editKind} ctx={editCtx} label="Editar" icon={<Pencil />} />
      </header>
      <dl className="divide-y divide-border/60">
        <Item label="Tipo de operación">{p.operation_type ? labelOf(OPERATION_TYPES, p.operation_type) : dash}</Item>
        <Item label="Tipo de inmueble">{p.property_type ? lookups.propertyType(p.property_type) : dash}</Item>
        <Item label={rent ? "Renta mensual" : "Presupuesto"}>{budget ?? dash}</Item>
        <Item label="Distritos">{p.districts.length ? lookups.districts(p.districts) : dash}</Item>
        <Item label="Habitaciones">{p.bedrooms_min != null ? `${p.bedrooms_min}+` : dash}</Item>
        <Item label="Baños">{p.bathrooms_min != null ? `${p.bathrooms_min}+` : dash}</Item>
        <Item label="Metraje">{area ?? dash}</Item>
        <Item label="Financiamiento">{p.financing ? labelOf(FINANCING, p.financing) : dash}</Item>
        {"interest_level" in p && <Item label="Nivel de interés">{p.interest_level ? labelOf(INTEREST_LEVELS, p.interest_level) : dash}</Item>}
        <Item label="Fecha de compra">{p.purchase_date ? fmtDate(p.purchase_date) : dash}</Item>
      </dl>
    </section>
  );
}
