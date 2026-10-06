import { randomUUID } from "node:crypto";
import type { Db, SqlParam } from "../db/types";
import { json } from "../db/types";
import { DAY, HOUR, MIN, type Rng } from "./rng";

export type Row = Record<string, SqlParam>;

// --- Tiempo (zona America/Lima, UTC-5 sin horario de verano) -------------------
const LIMA_OFFSET = 5 * HOUR;

export class Clock {
  /** Medianoche (hora Lima) del día actual, como instante UTC. */
  readonly todayStart: number;
  constructor(readonly now: Date) {
    const lima = new Date(now.getTime() - LIMA_OFFSET);
    this.todayStart = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()) + LIMA_OFFSET;
  }
  /** Instante en `dayOffset` días respecto a hoy (negativo = pasado), a la hora Lima indicada. */
  at(dayOffset: number, hour: number, minute = 0): Date {
    return new Date(this.todayStart + dayOffset * DAY + hour * HOUR + minute * MIN);
  }
  /** Día de la semana Lima (0 = domingo) para un instante. */
  weekday(d: Date): number {
    return new Date(d.getTime() - LIMA_OFFSET).getUTCDay();
  }
  hour(d: Date): number {
    return new Date(d.getTime() - LIMA_OFFSET).getUTCHours();
  }
  /** Desplaza un instante al horario comercial (9:00–19:30) manteniendo el día. */
  toBusinessHours(d: Date, rng: Rng): Date {
    const h = this.hour(d);
    if (h >= 9 && h < 20) return d;
    const dayStart = Math.floor((d.getTime() - LIMA_OFFSET) / DAY) * DAY + LIMA_OFFSET;
    const hour = rng.int(9, 19);
    return new Date(dayStart + hour * HOUR + rng.int(0, 59) * MIN);
  }
}

export const uuid = () => randomUUID();

// --- Inserción en lote --------------------------------------------------------
export async function bulkInsert(db: Db, table: string, rows: Row[], maxParams = 30000): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const perChunk = Math.max(1, Math.floor(maxParams / cols.length));
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const params: SqlParam[] = [];
    const tuples = chunk.map((row) => {
      const ph = cols.map((c) => {
        params.push(row[c] === undefined ? null : row[c]);
        return `$${params.length}`;
      });
      return `(${ph.join(",")})`;
    });
    await db.query(`insert into public.${table} (${cols.map((c) => `"${c}"`).join(",")}) values ${tuples.join(",")}`, params);
  }
}

// --- Fábricas de filas (todas las columnas presentes para el insert en lote) ---
type Overrides<T> = Partial<T> & Row;

export const mkLead = (o: Overrides<Row>): Row => ({
  id: uuid(),
  full_name: "",
  phone: null,
  email: null,
  source: "web",
  stage: "new",
  priority: "medium",
  score: 0,
  assigned_to: null,
  assigned_at: null,
  property_id: null,
  message: null,
  operation_type: null,
  property_type: null,
  budget_min: null,
  budget_max: null,
  currency: "PEN",
  districts: [],
  bedrooms_min: null,
  bathrooms_min: null,
  area_min: null,
  area_max: null,
  purchase_date: null,
  financing: null,
  interest_level: null,
  lost_reason: null,
  lost_notes: null,
  lost_at: null,
  client_id: null,
  converted_at: null,
  created_by: null,
  created_at: null,
  updated_at: null,
  ...o,
});

export const mkClient = (o: Overrides<Row>): Row => ({
  id: uuid(),
  full_name: "",
  doc_type: null,
  doc_number: null,
  phone: null,
  email: null,
  address: null,
  source: null,
  status: "active",
  assigned_to: null,
  operation_type: null,
  property_type: null,
  budget_min: null,
  budget_max: null,
  currency: "PEN",
  districts: [],
  bedrooms_min: null,
  bathrooms_min: null,
  area_min: null,
  area_max: null,
  financing: null,
  purchase_date: null,
  search_notes: null,
  created_by: null,
  created_at: null,
  updated_at: null,
  ...o,
});

export const mkActivity = (o: Overrides<Row>): Row => ({
  id: uuid(),
  type: "note",
  event: null,
  title: "",
  body: null,
  direction: "outbound",
  responded: null,
  lead_id: null,
  client_id: null,
  opportunity_id: null,
  property_id: null,
  owner_id: null,
  visit_id: null,
  note_id: null,
  user_id: null,
  metadata: json({}),
  occurred_at: null,
  created_at: null,
  ...o,
});

export const mkTask = (o: Overrides<Row>): Row => ({
  id: uuid(),
  title: "",
  description: null,
  kind: "follow_up",
  assigned_to: null,
  priority: "medium",
  due_at: null,
  status: "pending",
  completed_at: null,
  lead_id: null,
  client_id: null,
  opportunity_id: null,
  property_id: null,
  visit_id: null,
  created_by: null,
  created_at: null,
  updated_at: null,
  ...o,
});

export const mkVisit = (o: Overrides<Row>): Row => ({
  id: uuid(),
  property_id: null,
  lead_id: null,
  client_id: null,
  opportunity_id: null,
  advisor_id: null,
  scheduled_at: null,
  duration_min: 45,
  status: "scheduled",
  outcome: null,
  advisor_notes: null,
  observations: null,
  cancel_reason: null,
  rescheduled_from: null,
  confirmed_at: null,
  completed_at: null,
  created_by: null,
  created_at: null,
  updated_at: null,
  ...o,
});

export const mkOpp = (o: Overrides<Row>): Row => ({
  id: uuid(),
  lead_id: null,
  client_id: null,
  property_id: null,
  assigned_to: null,
  stage: "qualified",
  value: 0,
  currency: "PEN",
  probability: 25,
  priority: "medium",
  operation: "sale",
  expected_close_date: null,
  next_step: null,
  stage_changed_at: null,
  won_at: null,
  lost_at: null,
  lost_reason: null,
  lost_notes: null,
  created_by: null,
  created_at: null,
  updated_at: null,
  ...o,
});

export const mkNote = (o: Overrides<Row>): Row => ({
  id: uuid(),
  body: "",
  pinned: false,
  author_id: null,
  lead_id: null,
  client_id: null,
  opportunity_id: null,
  property_id: null,
  owner_id: null,
  created_at: null,
  updated_at: null,
  ...o,
});

// --- Textos realistas ---------------------------------------------------------
export const TEXT = {
  callAnswered: [
    "Conversamos sobre su búsqueda. Prefiere zonas con buena conectividad y edificios con seguridad.",
    "Confirmó su presupuesto y que evaluaría crédito hipotecario. Pidió que le envíe opciones por WhatsApp.",
    "Quiere ver propiedades este fin de semana. Trabaja de lunes a viernes.",
    "Llamada breve: está comparando con otras inmobiliarias. Se le explicó el proceso y las comisiones.",
    "Le interesó la ubicación; consulta si el precio es negociable.",
    "Pidió fotos, planos y gastos de mantenimiento. Se le enviará hoy.",
    "Busca algo para mudarse en los próximos 2 meses. Tiene mascota, necesita que acepten mascotas.",
    "Compra en pareja; la decisión la toman juntos, prefieren agendar visita con ambos.",
  ],
  callUnanswered: [
    "No contestó la llamada; se dejó mensaje de voz.",
    "Teléfono en buzón de voz. Se intentará nuevamente por WhatsApp.",
    "No contesta. Se enviará mensaje de presentación.",
  ],
  whatsappAnswered: [
    "Se envió presentación, fotos y ubicación de la propiedad. El cliente respondió con dudas sobre el mantenimiento.",
    "El cliente confirmó interés y pidió horarios disponibles para visita.",
    "Compartió su presupuesto y zonas de preferencia por WhatsApp.",
    "Respondió que lo conversa con su familia y escribe esta semana.",
    "Pidió más opciones similares con un poco más de área.",
  ],
  whatsappUnanswered: [
    "Se envió mensaje de presentación. Aún sin respuesta.",
    "Se reenvió información de la propiedad. Sin respuesta por ahora.",
    "Mensaje de seguimiento enviado; el cliente lo visualizó pero no respondió.",
  ],
  email: [
    "Se envió ficha técnica de la propiedad en PDF.",
    "Se compartió brochure y precios actualizados.",
    "Se envió propuesta con condiciones de pago y calendario de visitas.",
  ],
  qualification: [
    "Calificación: presupuesto definido, decide en 2 meses, financiamiento con entidad bancaria.",
    "Calificado: busca primera vivienda, zona definida y urgencia media.",
    "Cliente con capacidad de compra confirmada (pre-aprobación bancaria en trámite).",
    "Inversionista: busca rentabilidad por alquiler, evalúa más de una unidad.",
    "Familia de 4 personas, necesita 3 dormitorios cerca de colegios.",
  ],
  visitNotes: {
    very_interested: [
      "Se mostró muy interesado: le gustó la distribución y la luz natural. Quiere avanzar con una propuesta.",
      "Recorrió todos los ambientes y consultó por reserva. Pidió condiciones de pago.",
    ],
    interested: [
      "Le gustó la propiedad. Evaluará el precio y volverá con su pareja.",
      "Interesado, pero quiere comparar con otra opción que vio la semana pasada.",
    ],
    needs_time: [
      "Necesita pensarlo y revisar su financiamiento antes de decidir.",
      "Le gustó, pero primero debe vender su propiedad actual.",
    ],
    wants_other: [
      "La ubicación le gustó pero busca más área. Se le enviarán otras opciones.",
      "No era lo que buscaba; prefiere un piso más alto. Se agendará otra visita.",
    ],
    not_interested: [
      "No le convenció el estado del inmueble.",
      "Descartó por precio y ubicación respecto a su trabajo.",
    ],
  } as Record<string, string[]>,
  negotiation: [
    "Cliente propone 4% menos del precio publicado. Se consulta con el propietario.",
    "Propietario acepta rebajar el precio si se firma en 15 días.",
    "Se acordó reserva con arras; pendiente revisión de documentos.",
    "Cliente espera aprobación final del crédito para formalizar.",
  ],
  taskTitles: {
    call: (n: string) => `Llamar a ${n}`,
    whatsapp: (n: string) => `Escribir por WhatsApp a ${n}`,
    send_properties: (n: string) => `Enviar propiedades a ${n}`,
    follow_up: (n: string) => `Seguimiento con ${n}`,
    visit: (n: string) => `Confirmar visita con ${n}`,
    meeting: (n: string) => `Reunión con ${n}`,
    document: (n: string) => `Gestionar documentos de ${n}`,
  } as Record<string, (n: string) => string>,
};

export const LOSS_REASON_WEIGHTS: Array<readonly [string, number]> = [
  ["price", 28],
  ["other_property", 18],
  ["no_financing", 14],
  ["no_response", 12],
  ["postponed", 8],
  ["location", 6],
  ["features", 6],
  ["competition", 6],
  ["other", 2],
];

export function minimalPdf(title: string, lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, (c) => {
    const map: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n", Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ñ: "N", "·": "-", "—": "-", "–": "-" };
    return map[c] ?? "?";
  });
  const content = [
    "BT /F1 18 Tf 56 760 Td (" + esc(title) + ") Tj ET",
    ...lines.map((l, i) => `BT /F1 11 Tf 56 ${728 - i * 18} Td (${esc(l)}) Tj ET`),
  ].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
