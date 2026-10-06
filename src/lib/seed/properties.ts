import { randomUUID } from "node:crypto";
import { IMAGE_POOLS, unsplash, type ImagePool } from "./images";
import { DAY, type Rng } from "./rng";

export interface DistrictMeta {
  key: string;
  label: string;
  prefix: string;
  lat: number;
  lng: number;
  /** Precio de venta de departamento por m² (S/). */
  ppm: number;
  weight: number;
  premium: boolean;
  streets: string[];
  near: string[];
}

export const DISTRICTS: DistrictMeta[] = [
  { key: "miraflores", label: "Miraflores", prefix: "MF", lat: -12.1219, lng: -77.0297, ppm: 9500, weight: 9, premium: true, streets: ["Av. Larco", "Calle Berlín", "Av. Benavides", "Calle Schell", "Av. Pardo", "Calle Alcanfores"], near: ["Parque Kennedy", "Larcomar", "Av. Arequipa"] },
  { key: "san_isidro", label: "San Isidro", prefix: "SI", lat: -12.0977, lng: -77.0365, ppm: 10500, weight: 6, premium: true, streets: ["Av. Javier Prado Oeste", "Calle Las Camelias", "Av. República de Panamá", "Av. Conquistadores", "Calle Los Cedros"], near: ["Centro Financiero", "Parque El Olivar", "Av. Javier Prado"] },
  { key: "barranco", label: "Barranco", prefix: "BA", lat: -12.1491, lng: -77.0219, ppm: 8500, weight: 4, premium: true, streets: ["Av. Grau", "Jr. Domeyer", "Calle Centenario", "Av. San Martín"], near: ["Puente de los Suspiros", "Parque Municipal", "Bajada de Baños"] },
  { key: "surco", label: "Santiago de Surco", prefix: "SU", lat: -12.145, lng: -76.9917, ppm: 6800, weight: 12, premium: false, streets: ["Av. Caminos del Inca", "Av. Primavera", "Av. Benavides", "Calle Los Tulipanes", "Jr. Monterrico", "Av. El Polo"], near: ["Jockey Plaza", "Parque de la Amistad", "Av. Primavera"] },
  { key: "la_molina", label: "La Molina", prefix: "LM", lat: -12.085, lng: -76.934, ppm: 6200, weight: 9, premium: true, streets: ["Av. La Molina", "Calle Los Algarrobos", "Av. Raúl Ferrero", "Calle Las Orquídeas", "Av. Los Constructores"], near: ["Plaza Lima Sur", "Universidad Agraria", "Club Regatas"] },
  { key: "san_borja", label: "San Borja", prefix: "SB", lat: -12.1087, lng: -76.9985, ppm: 7800, weight: 7, premium: true, streets: ["Av. San Luis", "Av. Aviación", "Calle Las Gaviotas", "Av. Boulevard", "Calle Los Pinos"], near: ["Parque Mariscal Castilla", "Av. Javier Prado", "Clínica Good Hope"] },
  { key: "san_miguel", label: "San Miguel", prefix: "SM", lat: -12.077, lng: -77.083, ppm: 5200, weight: 10, premium: false, streets: ["Av. La Marina", "Av. Universitaria", "Av. Costanera", "Calle Los Ruiseñores", "Av. Precursores", "Jr. Pezet"], near: ["Plaza San Miguel", "Parque de las Leyendas", "PUCP"] },
  { key: "magdalena", label: "Magdalena del Mar", prefix: "MG", lat: -12.097, lng: -77.074, ppm: 6000, weight: 6, premium: false, streets: ["Av. Brasil", "Av. Salaverry", "Jr. Castilla", "Av. Sucre"], near: ["Parque Antonio Raimondi", "Av. Brasil", "Costa Verde"] },
  { key: "pueblo_libre", label: "Pueblo Libre", prefix: "PL", lat: -12.072, lng: -77.063, ppm: 5400, weight: 7, premium: false, streets: ["Av. Bolívar", "Av. Sucre", "Av. La Mar", "Av. San Martín"], near: ["Museo Larco", "Plaza Bolívar", "Av. La Marina"] },
  { key: "jesus_maria", label: "Jesús María", prefix: "JM", lat: -12.07, lng: -77.051, ppm: 5600, weight: 5, premium: false, streets: ["Av. Salaverry", "Av. Arenales", "Av. Húsares de Junín", "Jr. Cuba"], near: ["Campo de Marte", "Parque Jesús María", "Av. Brasil"] },
  { key: "lince", label: "Lince", prefix: "LI", lat: -12.085, lng: -77.034, ppm: 5000, weight: 3, premium: false, streets: ["Av. Arequipa", "Av. Petit Thouars", "Jr. Manuel Candamo"], near: ["Plaza San Martín", "Av. Arequipa", "Parque Mariscal Castilla"] },
  { key: "surquillo", label: "Surquillo", prefix: "SQ", lat: -12.113, lng: -77.02, ppm: 5600, weight: 3, premium: false, streets: ["Av. Angamos", "Av. Tomás Marsano", "Jr. Ayacucho"], near: ["Mercado de Surquillo", "Av. Angamos", "Vía Expresa"] },
  { key: "brena", label: "Breña", prefix: "BR", lat: -12.058, lng: -77.05, ppm: 4200, weight: 2, premium: false, streets: ["Av. Brasil", "Av. Alfonso Ugarte", "Jr. Zorritos"], near: ["Plaza Bolognesi", "Av. Brasil", "Hospital Rebagliati"] },
  { key: "cercado", label: "Cercado de Lima", prefix: "CL", lat: -12.0464, lng: -77.0428, ppm: 4000, weight: 2, premium: false, streets: ["Jr. de la Unión", "Av. Abancay", "Jr. Cusco"], near: ["Plaza Mayor", "Av. Abancay", "Estación Central"] },
  { key: "san_martin_de_porres", label: "San Martín de Porres", prefix: "SMP", lat: -12.0, lng: -77.085, ppm: 4100, weight: 6, premium: false, streets: ["Av. Tomás Valle", "Av. Alfredo Mendiola", "Av. Perú", "Av. Canta Callao"], near: ["Mega Plaza", "Av. Alfredo Mendiola", "Univ. San Martín"] },
  { key: "los_olivos", label: "Los Olivos", prefix: "LO", lat: -11.97, lng: -77.07, ppm: 3900, weight: 4, premium: false, streets: ["Av. Carlos Izaguirre", "Av. Alfredo Mendiola", "Av. Universitaria Norte", "Av. Naranjal"], near: ["Mega Plaza", "Parque Zonal Sinchi Roca", "Av. Alfredo Mendiola"] },
  { key: "chorrillos", label: "Chorrillos", prefix: "CH", lat: -12.17, lng: -77.01, ppm: 4500, weight: 3, premium: false, streets: ["Av. Defensores del Morro", "Av. Huaylas", "Av. Alejandro Iglesias"], near: ["Morro Solar", "Villa", "Costa Verde"] },
  { key: "callao", label: "Callao", prefix: "CA", lat: -12.056, lng: -77.118, ppm: 3800, weight: 2, premium: false, streets: ["Av. Sáenz Peña", "Av. Colonial", "Av. Elmer Faucett"], near: ["Aeropuerto Jorge Chávez", "Plaza Guardia Chalaca", "Av. Colonial"] },
];

export const districtByKey = (key: string) => DISTRICTS.find((d) => d.key === key)!;

export interface SeedProperty {
  id: string;
  code: string;
  title: string;
  description: string;
  propertyType: string;
  operation: "sale" | "rent";
  price: number;
  currency: "PEN" | "USD";
  minPrice: number | null;
  commissionPct: number;
  district: string;
  address: string;
  reference: string;
  latitude: number;
  longitude: number;
  totalArea: number | null;
  builtArea: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number;
  ageYears: number | null;
  floor: number | null;
  elevator: boolean;
  furnished: boolean;
  features: string[];
  status: "available" | "reserved" | "sold" | "rented" | "paused" | "withdrawn";
  publicationStatus: "published" | "pending" | "paused" | "withdrawn";
  ownerId: string;
  advisorId: string;
  createdAt: Date;
  images: Array<{ url: string; caption: string }>;
  /** Reducciones de precio: [precioAnterior, cuándo] */
  priceDrops: Array<{ from: number; at: Date }>;
  hero?: boolean;
}

const round = (n: number, step: number) => Math.round(n / step) * step;

class ImageCycler {
  private counters = new Map<ImagePool, number>();
  constructor(private offset = 0) {}
  take(pool: ImagePool, n = 1): string[] {
    const arr = IMAGE_POOLS[pool];
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const c = this.counters.get(pool) ?? this.offset;
      out.push(arr[c % arr.length]);
      this.counters.set(pool, c + 1);
    }
    return out;
  }
}

function gallery(type: string, cyc: ImageCycler, idx: number, title: string): Array<{ url: string; caption: string }> {
  const img = (id: string, caption: string) => ({ url: unsplash(id), caption });
  switch (type) {
    case "house":
      return [
        img(cyc.take("houseExterior")[0], "Fachada"),
        img(cyc.take("living")[0], "Sala"),
        img(cyc.take("kitchen")[0], "Cocina"),
        img(cyc.take("bedroom")[0], "Dormitorio principal"),
        img(cyc.take("bathroom")[0], "Baño principal"),
        img(cyc.take("houseInterior")[0], "Ambientes interiores"),
      ];
    case "office":
      return [
        img(cyc.take("office")[0], "Área de trabajo"),
        img(cyc.take("office")[0], "Sala de reuniones"),
        img(cyc.take("office")[0], "Open space"),
        img(cyc.take("officeExterior")[0], "Edificio"),
      ];
    case "commercial":
      return [
        img(cyc.take("commercial")[0], "Interior del local"),
        img(cyc.take("commercial")[0], "Zona de atención"),
        img(cyc.take("aptExterior")[0], "Frente del local"),
      ];
    case "land":
      return [img(cyc.take("land")[0], "Terreno"), img(cyc.take("land")[0], "Entorno"), img(cyc.take("land")[0], "Vista panorámica")];
    case "project":
      return [
        img(cyc.take("aptExterior")[0], "Render del proyecto"),
        img(cyc.take("living")[0], "Departamento modelo · sala"),
        img(cyc.take("kitchen")[0], "Departamento modelo · cocina"),
        img(cyc.take("bedroom")[0], "Departamento modelo · dormitorio"),
        img(cyc.take("aptExterior")[0], "Fachada"),
      ];
    default: {
      // departamento: alterna portada exterior / interior para variar el listado
      const exteriorFirst = idx % 3 !== 0;
      const first = exteriorFirst
        ? img(cyc.take("aptExterior")[0], "Edificio")
        : img(cyc.take("living")[0], "Sala comedor");
      return [
        first,
        ...(exteriorFirst ? [img(cyc.take("living")[0], "Sala comedor")] : []),
        img(cyc.take("kitchen")[0], "Cocina"),
        img(cyc.take("bedroom")[0], "Dormitorio principal"),
        img(cyc.take("bathroom")[0], "Baño"),
        img(cyc.take("living")[0], title.includes("amoblado") ? "Ambientes amoblados" : "Ambientes"),
      ];
    }
  }
}

function featuresFor(rng: Rng, type: string, newish: boolean): string[] {
  const p: Record<string, Array<[string, number]>> = {
    apartment: [["balcony", 0.45], ["terrace", 0.1], ["security", 0.5], ["laundry", 0.3], ["storage", 0.25], ["exterior_view", 0.4], ["pets", 0.35], ["gym", newish ? 0.45 : 0.1], ["bbq", 0.12], ["playground", 0.1], ["coworking", newish ? 0.12 : 0], ["rooftop", 0.15]],
    house: [["garden", 0.8], ["pool", 0.2], ["security", 0.4], ["laundry", 0.7], ["storage", 0.5], ["bbq", 0.5], ["terrace", 0.4], ["pets", 0.7], ["balcony", 0.3]],
    office: [["security", 0.7], ["coworking", 0.05], ["storage", 0.3], ["exterior_view", 0.4]],
    commercial: [["storage", 0.4], ["security", 0.3]],
    land: [],
    project: [["gym", 0.8], ["coworking", 0.5], ["rooftop", 0.6], ["security", 0.9], ["bbq", 0.5], ["playground", 0.4], ["pets", 0.8]],
  };
  return (p[type] ?? []).filter(([, pr]) => rng.chance(pr)).map(([f]) => f);
}

interface PropertySpec {
  district: string;
  type: "apartment" | "house" | "office" | "commercial" | "land" | "project";
  operation: "sale" | "rent";
  bedrooms?: number | null;
  status: SeedProperty["status"];
  /** Datos forzados para propiedades "estrella" del demo */
  fixed?: Partial<SeedProperty> & { street?: string; number?: number };
}

export interface PropertyGenContext {
  rng: Rng;
  now: Date;
  advisorIds: string[];
  ownerIds: string[];
  usdRate: number;
}

function buildProperty(spec: PropertySpec, idx: number, ctx: PropertyGenContext, codes: Map<string, number>, cyc: ImageCycler): SeedProperty {
  const { rng, now, usdRate } = ctx;
  const d = districtByKey(spec.district);
  const type = spec.type;
  const f = spec.fixed ?? {};

  // Código: prefijo del distrito + correlativo
  const used = codes.get(d.prefix) ?? 0;
  const num = f.code ? Number(f.code.split("-")[1]) : used + rng.int(1, 4);
  codes.set(d.prefix, Math.max(used, num));
  const code = f.code ?? `${d.prefix}-${String(num).padStart(3, "0")}`;

  // Dimensiones
  let bedrooms: number | null = spec.bedrooms ?? null;
  let bathrooms: number | null = null;
  let totalArea: number | null = null;
  let builtArea: number | null = null;
  let parking = 0;
  let floor: number | null = null;
  let ageYears: number | null = rng.pick([0, 0, 1, 2, 3, 5, 6, 8, 10, 12, 15, 20, 25]);
  let elevator = false;

  if (type === "apartment" || type === "project") {
    bedrooms ??= rng.weighted([[1, 2], [2, 5], [3, 6], [4, 1]]);
    const base = { 1: [42, 62], 2: [62, 92], 3: [88, 135], 4: [135, 190] }[bedrooms] ?? [60, 100];
    builtArea = rng.int(base[0], base[1]);
    totalArea = builtArea + (rng.chance(0.2) ? rng.int(6, 22) : 0);
    bathrooms = Math.min(bedrooms + (rng.chance(0.25) ? 1 : 0), 4);
    parking = rng.weighted([[0, 2], [1, 6], [2, 3]]);
    floor = rng.int(1, 14);
    elevator = floor > 3 || rng.chance(0.4);
    if (type === "project") ageYears = 0;
  } else if (type === "house") {
    bedrooms ??= rng.weighted([[3, 5], [4, 6], [5, 2]]);
    builtArea = rng.int(130 + bedrooms * 30, 200 + bedrooms * 55);
    totalArea = builtArea + rng.int(30, d.premium ? 260 : 150);
    bathrooms = bedrooms + rng.int(0, 1);
    parking = rng.int(1, 3);
    floor = null;
  } else if (type === "office") {
    builtArea = rng.int(38, 230);
    totalArea = builtArea;
    bathrooms = Math.max(1, Math.floor(builtArea / 80));
    parking = rng.int(0, 3);
    floor = rng.int(1, 12);
    elevator = floor > 2;
    bedrooms = null;
  } else if (type === "commercial") {
    builtArea = rng.int(45, 260);
    totalArea = builtArea + rng.int(0, 30);
    bathrooms = rng.int(1, 3);
    parking = rng.int(0, 4);
    floor = 1;
    bedrooms = null;
  } else {
    totalArea = rng.int(140, 1200);
    builtArea = null;
    ageYears = null;
    bedrooms = null;
    bathrooms = null;
  }

  // Precio
  const factorAge = ageYears != null && ageYears > 15 ? 0.9 : ageYears != null && ageYears <= 2 ? 1.07 : 1;
  const noise = rng.float(0.92, 1.1);
  let valuePen = 0;
  if (type === "apartment" || type === "project") valuePen = (builtArea ?? 80) * d.ppm * factorAge * noise;
  else if (type === "house") valuePen = (builtArea ?? 200) * d.ppm * 0.95 * noise + ((totalArea ?? 0) - (builtArea ?? 0)) * d.ppm * 0.3;
  else if (type === "office") valuePen = (builtArea ?? 80) * d.ppm * 0.95 * noise;
  else if (type === "commercial") valuePen = (builtArea ?? 100) * d.ppm * 0.9 * noise;
  else valuePen = (totalArea ?? 300) * d.ppm * 0.5 * noise;

  const operation = spec.operation;
  let currency: "PEN" | "USD";
  let price: number;
  if (operation === "sale") {
    currency = rng.chance(d.premium ? 0.65 : type === "house" ? 0.4 : 0.2) ? "USD" : "PEN";
    price = currency === "USD" ? round(valuePen / usdRate, 1000) : round(valuePen, 5000);
  } else {
    const monthlyPen = valuePen * (type === "house" ? 0.0042 : type === "office" ? 0.0058 : 0.0046);
    currency = type === "office" && rng.chance(0.6) ? "USD" : "PEN";
    price = currency === "USD" ? round(monthlyPen / usdRate, 50) : round(monthlyPen, 50);
  }

  const street = f.street ?? rng.pick(d.streets);
  const streetNum = f.number ?? rng.int(100, 2900);
  const address = `${street} ${streetNum}${type === "apartment" && floor ? `, piso ${floor}` : ""}`;
  const reference = `Cerca a ${rng.pick(d.near)}`;
  const features = featuresFor(rng, type, (ageYears ?? 10) <= 5);

  // Título
  const nb = bedrooms ?? 0;
  let title = f.title ?? "";
  if (!title) {
    if (type === "apartment") {
      title = operation === "rent"
        ? rng.pick([`Alquiler de departamento ${nb} ${nb === 1 ? "dormitorio" : "dormitorios"} en ${d.label}`, `Departamento amoblado en ${d.label}`, `Departamento luminoso en alquiler en ${d.label}`])
        : nb === 1
          ? `Minidepartamento ${rng.pick(["moderno", "amoblado", "de estreno"])} en ${d.label}`
          : nb === 4 && d.premium && rng.chance(0.5)
            ? `Penthouse con terraza en ${d.label}`
            : rng.pick([`Departamento moderno en ${d.label}`, `Departamento ${nb} ${nb === 1 ? "dormitorio" : "dormitorios"} en ${d.label}`, `Departamento de estreno en ${d.label}`, `Departamento amplio y luminoso en ${d.label}`, `Departamento familiar en ${d.label}`, `Departamento con vista al parque en ${d.label}`]);
    } else if (type === "house") {
      title = rng.pick([`Casa familiar en ${d.label}`, `Casa moderna con jardín en ${d.label}`, `Casa de 3 pisos en ${d.label}`, features.includes("pool") ? `Casa con piscina en ${d.label}` : `Casa independiente en ${d.label}`]);
    } else if (type === "office") {
      title = rng.pick([`Oficina comercial en ${d.label}`, `Oficina corporativa en ${d.label}`, `Oficina amoblada en ${d.label}`]);
    } else if (type === "commercial") {
      title = rng.pick([`Local comercial en ${d.label}`, `Local en esquina en ${d.label}`, `Local con frente a avenida en ${d.label}`]);
    } else if (type === "land") {
      title = rng.pick([`Terreno esquina en ${d.label}`, `Terreno residencial en ${d.label}`, `Terreno comercial en ${d.label}`]);
    } else {
      title = `${rng.pick(["Residencial Alameda Real", "Torre Aurora", "Vista Jardín", "Mirador del Sol", "Plaza Norte Residencial"])} · departamentos en ${d.label}`;
    }
  }

  const feat = (k: string) => features.includes(k);
  const parts: string[] = [];
  if (type === "land") parts.push(`Terreno de ${totalArea} m² ubicado en ${address}, ${d.label}. Ideal para ${rng.pick(["vivienda multifamiliar", "proyecto inmobiliario", "construcción de vivienda", "uso comercial"])}.`);
  else parts.push(`${title.split(" en ")[0]} ubicado en ${address}, ${d.label}, con ${builtArea ?? totalArea} m² ${nb ? `distribuidos en ${nb} dormitorios` : "de área útil"}${bathrooms ? ` y ${bathrooms} baños` : ""}.`);
  if (parking) parts.push(`Cuenta con ${parking} ${parking === 1 ? "cochera" : "cocheras"}.`);
  if (feat("balcony") || feat("terrace")) parts.push(`Ambientes con ${feat("terrace") ? "terraza" : "balcón"} y excelente iluminación natural.`);
  if (feat("garden")) parts.push("Jardín privado ideal para familias.");
  if (feat("pool")) parts.push("Piscina propia.");
  if (feat("security")) parts.push("Edificio con seguridad 24 horas.");
  parts.push(`${reference}. Zona con ${rng.pick(["colegios, supermercados y áreas verdes", "excelente conectividad y comercios", "restaurantes, centros de salud y transporte", "parques y vida de barrio"])}.`);

  const createdAt = f.createdAt ?? new Date(now.getTime() - rng.int(20, 170) * DAY);
  const images = gallery(type, cyc, idx, title);
  const advisorId = f.advisorId ?? ctx.advisorIds[idx % ctx.advisorIds.length];

  return {
    id: randomUUID(),
    code,
    title,
    description: parts.join(" "),
    propertyType: type,
    operation,
    price,
    currency,
    minPrice: operation === "sale" ? round(price * rng.float(0.93, 0.97), currency === "USD" ? 1000 : 5000) : null,
    commissionPct: operation === "sale" ? rng.pick([3, 3.5, 4, 5]) : 8,
    district: d.key,
    address,
    reference,
    latitude: Number((d.lat + rng.float(-0.006, 0.006)).toFixed(6)),
    longitude: Number((d.lng + rng.float(-0.006, 0.006)).toFixed(6)),
    totalArea,
    builtArea,
    bedrooms,
    bathrooms,
    parking,
    ageYears,
    floor,
    elevator,
    furnished: operation === "rent" ? rng.chance(0.5) : rng.chance(0.08),
    features,
    status: spec.status,
    publicationStatus: "published",
    ownerId: f.ownerId ?? ctx.ownerIds[idx % ctx.ownerIds.length],
    advisorId,
    createdAt,
    images,
    priceDrops: [],
    ...f,
  } as SeedProperty;
}

/**
 * Inventario: ~90 propiedades con la mezcla típica de una inmobiliaria limeña.
 * Los estados finales se fijan de antemano para que el pipeline sea consistente
 * (las vendidas/alquiladas/reservadas se consumen luego en las oportunidades).
 */
export interface HeroSpec extends Partial<Omit<SeedProperty, "bedrooms" | "status">> {
  district: string;
  type: PropertySpec["type"];
  operation: "sale" | "rent";
  bedrooms?: number | null;
  status: SeedProperty["status"];
  street?: string;
  number?: number;
}

export function generateProperties(ctx: PropertyGenContext, heroes: HeroSpec[]): SeedProperty[] {
  const { rng } = ctx;
  const codes = new Map<string, number>();
  const cyc = new ImageCycler(3);
  const specs: PropertySpec[] = [];

  for (const h of heroes) {
    const { district, type, operation, bedrooms, status, ...fixed } = h;
    specs.push({ district, type, operation, bedrooms, status, fixed: { ...fixed, hero: true } });
  }

  const typeMix: Array<[PropertySpec["type"], number]> = [["apartment", 50], ["house", 20], ["office", 9], ["commercial", 7], ["land", 5], ["project", 3]];
  const statusQuota: Array<[SeedProperty["status"], number]> = [["sold", 15], ["rented", 9], ["reserved", 8], ["paused", 3], ["withdrawn", 2]];
  const total = 100;
  const statuses: SeedProperty["status"][] = [];
  for (const [s, n] of statusQuota) for (let i = 0; i < n; i++) statuses.push(s);
  while (statuses.length < total - heroes.length) statuses.push("available");
  const shuffled = rng.shuffle(statuses);

  for (let i = 0; i < total - heroes.length; i++) {
    const status = shuffled[i];
    const type = status === "sold" || status === "rented" ? rng.weighted([["apartment", 82], ["house", 8], ["office", 5], ["commercial", 5]] as const) : rng.weighted(typeMix);
    let operation: "sale" | "rent" = rng.chance(type === "land" || type === "project" ? 1 : 0.7) ? "sale" : "rent";
    if (status === "sold") operation = "sale";
    if (status === "rented") operation = "rent";
    const district = rng.weighted(DISTRICTS.map((d) => [d.key, d.weight] as const));
    specs.push({ district, type, operation, status });
  }

  const props = specs.map((s, i) => buildProperty(s, i, ctx, codes, cyc));

  // Publicación, fechas y reducciones de precio coherentes con el estado
  const { rng: r, now } = ctx;
  for (const p of props) {
    if (p.status === "sold" || p.status === "rented") p.publicationStatus = "withdrawn";
    else if (p.status === "paused") p.publicationStatus = "paused";
    else if (p.status === "withdrawn") p.publicationStatus = "withdrawn";
    else p.publicationStatus = r.chance(0.12) && now.getTime() - p.createdAt.getTime() < 12 * DAY ? "pending" : "published";
    if (p.operation === "sale" && p.status === "available" && r.chance(0.2)) {
      const mult = r.pick([1.04, 1.06, 1.08]);
      p.priceDrops.push({ from: round(p.price * mult, p.currency === "USD" ? 1000 : 5000), at: new Date(now.getTime() - r.int(5, 40) * DAY) });
    }
  }
  return props;
}
