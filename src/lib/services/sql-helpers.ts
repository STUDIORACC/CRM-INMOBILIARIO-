import type { Currency } from "@/lib/domain/constants";

/** Expresión SQL que convierte un monto a la moneda de reportes usando el tipo de cambio de la empresa. */
export function toCurrencySql(alias: string, col: string, currency: Currency, usdRate: number): string {
  const rate = Number(usdRate) || 1;
  return currency === "PEN"
    ? `(case when ${alias}.currency = 'USD' then ${alias}.${col} * ${rate} else ${alias}.${col} end)`
    : `(case when ${alias}.currency = 'PEN' then ${alias}.${col} / ${rate} else ${alias}.${col} end)`;
}

/** Construye condiciones `a = $1 or b = any($2)` para listados "de un registro" (lead, cliente, propiedad…). */
export function orScope() {
  const params: Array<string | string[]> = [];
  const conds: string[] = [];
  return {
    params,
    conds,
    eq(col: string, v?: string | null) {
      if (!v) return;
      params.push(v);
      conds.push(`${col} = $${params.length}::uuid`);
    },
    any(col: string, v?: string[]) {
      if (!v?.length) return;
      params.push(v);
      conds.push(`${col} = any($${params.length}::uuid[])`);
    },
  };
}
