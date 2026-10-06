import { CURRENCY_SYMBOL, type Currency } from "./constants";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export const formatNumber = (n: number | null | undefined) => (n == null ? "—" : nf.format(n));

export function formatMoney(amount: number | null | undefined, currency: Currency = "PEN"): string {
  if (amount == null) return "—";
  return `${CURRENCY_SYMBOL[currency]} ${nf.format(amount)}`;
}

/** S/ 3.45 M · S/ 480 K — para tarjetas y ejes. */
export function formatMoneyCompact(amount: number | null | undefined, currency: Currency = "PEN"): string {
  if (amount == null) return "—";
  const sym = CURRENCY_SYMBOL[currency];
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${sym} ${nf2.format(amount / 1_000_000)} M`;
  if (abs >= 10_000) return `${sym} ${nf.format(amount / 1_000)} K`;
  return `${sym} ${nf.format(amount)}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(digits === 0 ? nf : nf1).format(value)}%`;
}

export const formatArea = (m2: number | null | undefined) => (m2 == null ? "—" : `${nf2.format(m2)} m²`);

/** Convierte a la moneda base de reportes. */
export function toBaseCurrency(amount: number, from: Currency, base: Currency, usdRate: number): number {
  if (from === base) return amount;
  return from === "USD" ? amount * usdRate : amount / usdRate;
}
