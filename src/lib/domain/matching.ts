import type { Currency, OperationType } from "./constants";

/**
 * Motor de matching búsqueda ↔ propiedad.
 * Cada criterio puntúa de 0 a 1 y se pondera; los criterios que el cliente no
 * definió se excluyen del cálculo (no penalizan). La operación es un filtro duro.
 */
export interface SearchProfile {
  operationType: OperationType | null;
  propertyType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: Currency;
  districts: string[];
  bedroomsMin: number | null;
  bathroomsMin: number | null;
  areaMin: number | null;
  areaMax: number | null;
}

export interface MatchableProperty {
  id: string;
  operation: "sale" | "rent";
  propertyType: string;
  price: number;
  minPrice: number | null;
  currency: Currency;
  district: string;
  bedrooms: number | null;
  bathrooms: number | null;
  totalArea: number | null;
  builtArea: number | null;
}

export type ReasonStatus = "match" | "partial" | "miss";

export interface MatchReason {
  key: "operation" | "type" | "budget" | "district" | "bedrooms" | "bathrooms" | "area";
  label: string;
  status: ReasonStatus;
  detail: string;
  weight: number;
}

export interface MatchResult {
  eligible: boolean;
  score: number;
  reasons: MatchReason[];
  /** Criterios del perfil que no se pudieron evaluar. */
  skipped: string[];
}

export interface MatchContext {
  usdRate: number;
  districtLabel: (key: string) => string;
  typeLabel?: (key: string) => string;
}

const WEIGHTS = { operation: 10, type: 10, budget: 30, district: 20, bedrooms: 10, bathrooms: 5, area: 15 } as const;

/** Distritos limítrofes o de perfil similar para coincidencia parcial por zona. */
const ADJACENCY: Record<string, string[]> = {
  san_miguel: ["magdalena", "pueblo_libre", "san_martin_de_porres", "callao"],
  magdalena: ["san_miguel", "pueblo_libre", "jesus_maria", "san_isidro"],
  pueblo_libre: ["san_miguel", "magdalena", "jesus_maria", "cercado", "brena"],
  jesus_maria: ["magdalena", "pueblo_libre", "lince", "san_isidro", "brena"],
  lince: ["jesus_maria", "san_isidro", "brena", "surquillo"],
  san_isidro: ["miraflores", "magdalena", "jesus_maria", "lince", "san_borja"],
  miraflores: ["san_isidro", "barranco", "surquillo", "san_borja"],
  barranco: ["miraflores", "surco", "chorrillos", "surquillo"],
  surquillo: ["miraflores", "surco", "san_borja", "barranco"],
  surco: ["san_borja", "la_molina", "surquillo", "barranco", "chorrillos"],
  san_borja: ["surco", "san_isidro", "miraflores", "surquillo", "la_molina"],
  la_molina: ["surco", "san_borja", "ate"],
  chorrillos: ["barranco", "surco"],
  brena: ["pueblo_libre", "jesus_maria", "cercado", "lince"],
  cercado: ["brena", "pueblo_libre", "san_martin_de_porres"],
  san_martin_de_porres: ["los_olivos", "cercado", "callao", "san_miguel"],
  los_olivos: ["san_martin_de_porres"],
  callao: ["san_miguel", "san_martin_de_porres"],
  ate: ["la_molina", "surco"],
};

export function areNearby(a: string, b: string): boolean {
  return (ADJACENCY[a] ?? []).includes(b) || (ADJACENCY[b] ?? []).includes(a);
}

const money = (n: number, c: Currency) =>
  `${c === "USD" ? "US$" : "S/"} ${Math.round(n).toLocaleString("en-US")}`;

function convert(amount: number, from: Currency, to: Currency, usdRate: number): number {
  if (from === to) return amount;
  return from === "USD" ? amount * usdRate : amount / usdRate;
}

export function profileIsEmpty(p: SearchProfile): boolean {
  return (
    !p.operationType &&
    !p.propertyType &&
    p.budgetMin == null &&
    p.budgetMax == null &&
    p.districts.length === 0 &&
    p.bedroomsMin == null &&
    p.bathroomsMin == null &&
    p.areaMin == null &&
    p.areaMax == null
  );
}

export function matchProperty(profile: SearchProfile, property: MatchableProperty, ctx: MatchContext): MatchResult {
  const reasons: MatchReason[] = [];
  const skipped: string[] = [];
  let earned = 0;
  let possible = 0;

  const push = (r: Omit<MatchReason, "weight">, factor: number) => {
    const weight = WEIGHTS[r.key];
    reasons.push({ ...r, weight });
    earned += weight * factor;
    possible += weight;
  };

  // Operación (filtro duro)
  if (profile.operationType) {
    if (profile.operationType === "sell") {
      return { eligible: false, score: 0, reasons: [], skipped: ["operation"] };
    }
    const wanted = profile.operationType === "rent" ? "rent" : "sale";
    if (wanted !== property.operation) {
      return {
        eligible: false,
        score: 0,
        reasons: [
          {
            key: "operation",
            label: "Operación",
            status: "miss",
            detail: `Busca ${wanted === "rent" ? "alquiler" : "compra"} y la propiedad es en ${property.operation === "rent" ? "alquiler" : "venta"}`,
            weight: WEIGHTS.operation,
          },
        ],
        skipped: [],
      };
    }
    push({ key: "operation", label: "Operación", status: "match", detail: wanted === "rent" ? "Alquiler" : "Compra / venta" }, 1);
  } else skipped.push("operation");

  // Tipo de inmueble
  if (profile.propertyType) {
    const same = profile.propertyType === property.propertyType;
    const t = ctx.typeLabel ?? ((k: string) => k);
    push(
      {
        key: "type",
        label: "Tipo de inmueble",
        status: same ? "match" : "miss",
        detail: same ? t(property.propertyType) : `Busca ${t(profile.propertyType).toLowerCase()}, es ${t(property.propertyType).toLowerCase()}`,
      },
      same ? 1 : 0,
    );
  } else skipped.push("type");

  // Presupuesto
  if (profile.budgetMin != null || profile.budgetMax != null) {
    const c = profile.currency;
    const price = convert(property.price, property.currency, c, ctx.usdRate);
    const floor = property.minPrice != null ? convert(property.minPrice, property.currency, c, ctx.usdRate) : null;
    const { budgetMin: lo, budgetMax: hi } = profile;
    const range = `${lo != null ? money(lo, c) : "—"} – ${hi != null ? money(hi, c) : "—"}`;
    if (hi == null || price <= hi) {
      if (lo != null && price < lo) {
        push({ key: "budget", label: "Presupuesto", status: "partial", detail: `${money(price, c)} está por debajo del rango (${range})` }, 0.85);
      } else {
        push({ key: "budget", label: "Presupuesto", status: "match", detail: `${money(price, c)} dentro de ${range}` }, 1);
      }
    } else if (floor != null && floor <= hi) {
      push({ key: "budget", label: "Presupuesto", status: "partial", detail: `${money(price, c)} supera el rango, pero es negociable hasta ${money(floor, c)}` }, 0.7);
    } else if (price <= hi * 1.1) {
      push({ key: "budget", label: "Presupuesto", status: "partial", detail: `${money(price, c)} excede hasta 10% el máximo (${money(hi, c)})` }, 0.4);
    } else if (price <= hi * 1.2) {
      push({ key: "budget", label: "Presupuesto", status: "partial", detail: `${money(price, c)} excede hasta 20% el máximo (${money(hi, c)})` }, 0.15);
    } else {
      push({ key: "budget", label: "Presupuesto", status: "miss", detail: `${money(price, c)} supera el máximo (${money(hi, c)})` }, 0);
    }
  } else skipped.push("budget");

  // Distrito
  if (profile.districts.length > 0) {
    if (profile.districts.includes(property.district)) {
      push({ key: "district", label: "Distrito", status: "match", detail: ctx.districtLabel(property.district) }, 1);
    } else {
      const near = profile.districts.find((d) => areNearby(d, property.district));
      if (near) {
        push({ key: "district", label: "Distrito", status: "partial", detail: `${ctx.districtLabel(property.district)}, cercano a ${ctx.districtLabel(near)}` }, 0.4);
      } else {
        push({ key: "district", label: "Distrito", status: "miss", detail: `${ctx.districtLabel(property.district)} no está entre sus zonas` }, 0);
      }
    }
  } else skipped.push("district");

  // Dormitorios
  if (profile.bedroomsMin != null) {
    if (property.bedrooms == null) skipped.push("bedrooms");
    else if (property.bedrooms >= profile.bedroomsMin) {
      push({ key: "bedrooms", label: "Dormitorios", status: "match", detail: `${property.bedrooms} (mínimo ${profile.bedroomsMin})` }, 1);
    } else if (property.bedrooms === profile.bedroomsMin - 1) {
      push({ key: "bedrooms", label: "Dormitorios", status: "partial", detail: `${property.bedrooms}, uno menos del mínimo (${profile.bedroomsMin})` }, 0.5);
    } else {
      push({ key: "bedrooms", label: "Dormitorios", status: "miss", detail: `${property.bedrooms} (mínimo ${profile.bedroomsMin})` }, 0);
    }
  } else skipped.push("bedrooms");

  // Baños
  if (profile.bathroomsMin != null) {
    if (property.bathrooms == null) skipped.push("bathrooms");
    else if (property.bathrooms >= profile.bathroomsMin) {
      push({ key: "bathrooms", label: "Baños", status: "match", detail: `${property.bathrooms} (mínimo ${profile.bathroomsMin})` }, 1);
    } else if (property.bathrooms === profile.bathroomsMin - 1) {
      push({ key: "bathrooms", label: "Baños", status: "partial", detail: `${property.bathrooms}, uno menos del mínimo (${profile.bathroomsMin})` }, 0.5);
    } else {
      push({ key: "bathrooms", label: "Baños", status: "miss", detail: `${property.bathrooms} (mínimo ${profile.bathroomsMin})` }, 0);
    }
  } else skipped.push("bathrooms");

  // Área
  if (profile.areaMin != null || profile.areaMax != null) {
    const area = property.totalArea ?? property.builtArea;
    if (area == null) skipped.push("area");
    else {
      const { areaMin: lo, areaMax: hi } = profile;
      const range = `${lo != null ? `${lo}` : "—"}–${hi != null ? `${hi}` : "—"} m²`;
      if ((lo == null || area >= lo) && (hi == null || area <= hi)) {
        push({ key: "area", label: "Área", status: "match", detail: `${area} m² dentro de ${range}` }, 1);
      } else if (lo != null && area < lo) {
        if (area >= lo * 0.9) push({ key: "area", label: "Área", status: "partial", detail: `${area} m², hasta 10% bajo el mínimo (${lo} m²)` }, 0.6);
        else if (area >= lo * 0.8) push({ key: "area", label: "Área", status: "partial", detail: `${area} m², hasta 20% bajo el mínimo (${lo} m²)` }, 0.3);
        else push({ key: "area", label: "Área", status: "miss", detail: `${area} m² bajo el mínimo (${lo} m²)` }, 0);
      } else if (hi != null && area > hi) {
        if (area <= hi * 1.2) push({ key: "area", label: "Área", status: "partial", detail: `${area} m², hasta 20% sobre el máximo (${hi} m²)` }, 0.6);
        else push({ key: "area", label: "Área", status: "miss", detail: `${area} m² sobre el máximo (${hi} m²)` }, 0);
      }
    }
  } else skipped.push("area");

  if (possible === 0) return { eligible: true, score: 0, reasons, skipped };
  return { eligible: true, score: Math.round((earned / possible) * 100), reasons, skipped };
}

/** Prefiltro SQL: rangos amplios para no evaluar todo el catálogo. */
export function prefilterBounds(profile: SearchProfile, usdRate: number): { maxPricePen: number | null; maxPriceUsd: number | null } {
  if (profile.budgetMax == null) return { maxPricePen: null, maxPriceUsd: null };
  const capped = profile.budgetMax * 1.25;
  return profile.currency === "PEN"
    ? { maxPricePen: capped, maxPriceUsd: capped / usdRate }
    : { maxPriceUsd: capped, maxPricePen: capped * usdRate };
}
