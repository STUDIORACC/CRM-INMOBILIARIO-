import { VISIT_OUTCOMES, LEAD_STAGES, labelOf, type VisitOutcome } from "../domain/constants";
import { areNearby } from "../domain/matching";
import { eventTitle, type SystemEvent } from "../domain/events";
import { json } from "../db/types";
import {
  Clock,
  LOSS_REASON_WEIGHTS,
  TEXT,
  mkActivity,
  mkClient,
  mkLead,
  mkNote,
  mkOpp,
  mkTask,
  mkVisit,
  uuid,
  type Row,
} from "./builders";
import { emailFor, phoneFor, randomPerson, dniFor, strip } from "./names";
import { DISTRICTS, districtByKey, type SeedProperty } from "./properties";
import { DAY, HOUR, MIN, type Rng } from "./rng";

export const PATH = ["new", "contacted", "qualified", "interested", "visit_scheduled", "visit_done", "negotiation", "reserved", "won"] as const;
export type PathStage = (typeof PATH)[number];

const LEAD_STAGE_OF: Record<PathStage, string> = {
  new: "new",
  contacted: "contacted",
  qualified: "qualified",
  interested: "opportunity",
  visit_scheduled: "visit",
  visit_done: "visit",
  negotiation: "negotiation",
  reserved: "negotiation",
  won: "won",
};

export const PIPE_LABEL: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  interested: "Interesado",
  visit_scheduled: "Visita programada",
  visit_done: "Visita realizada",
  negotiation: "Negociación",
  reserved: "Reserva / separación",
  won: "Cerrado ganado",
  lost: "Cerrado perdido",
};

const PROB: Record<string, number> = { new: 10, contacted: 10, qualified: 25, interested: 25, visit_scheduled: 50, visit_done: 50, negotiation: 75, reserved: 90, won: 100, lost: 0 };

export interface Advisor {
  id: string;
  name: string;
  weight: number;
  /** Multiplicador de efectividad comercial (diferencia el ranking). */
  mult: number;
}

export interface SeedOutput {
  leads: Row[];
  clients: Row[];
  opportunities: Row[];
  visits: Row[];
  tasks: Row[];
  activities: Row[];
  notes: Row[];
  leadTags: Row[];
  clientTags: Row[];
  stageHistory: Row[];
  audit: Row[];
}

export interface PropertyPools {
  all: SeedProperty[];
  open: SeedProperty[];
  reservedFree: SeedProperty[];
  soldFree: SeedProperty[];
  rentedFree: SeedProperty[];
}

export interface SimContext {
  rng: Rng;
  clock: Clock;
  manager: { id: string; name: string };
  assistant: { id: string; name: string };
  advisors: Advisor[];
  pools: PropertyPools;
  tagIds: Record<string, string>;
  phones: Set<string>;
  districtLabel: (k: string) => string;
  sourceLabel: (k: string) => string;
  lossLabel: (k: string) => string;
  out: SeedOutput;
}

export interface LeadPlan {
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  /** Instantes de cada hito en días atrás (índice = etapa del PATH). Determina createdAt y los tiempos. */
  timesAgo?: number[];
  createdAt?: Date;
  /** null = sin asignar */
  advisorId?: string | null;
  operation?: "buy" | "rent" | "invest" | "sell";
  property?: SeedProperty;
  reach?: PathStage;
  end?: "open" | "lost";
  lostReason?: string;
  visitOutcomes?: VisitOutcome[];
  tags?: string[];
  priority?: "low" | "medium" | "high" | "urgent";
  interestLevel?: "low" | "medium" | "high" | "urgent";
  financing?: "cash" | "mortgage" | "undecided";
  profile?: Partial<{ budgetMin: number; budgetMax: number; currency: "PEN" | "USD"; districts: string[]; bedroomsMin: number; bathroomsMin: number; areaMin: number; areaMax: number; propertyType: string; purchaseInDays: number }>;
  value?: number;
  convertToClient?: boolean;
  /** Tareas abiertas forzadas (hoy, vencidas…). */
  tasks?: Array<{ title: string; kind: string; dueDay: number; hour: number; minute?: number; done?: boolean }>;
  noAutoTask?: boolean;
  /** Deja la visita futura sin confirmar / el seguimiento sin tarea, etc. */
  visitStatus?: "scheduled" | "confirmed";
  messageText?: string;
  probability?: 10 | 25 | 50 | 75 | 90;
  /** La oportunidad queda sin movimiento tras entrar a su última etapa (caso estancada). */
  stalled?: boolean;
  /** Visita futura forzada: día relativo a hoy y hora Lima. */
  visitAtOffset?: { day: number; hour: number; minute?: number };
}

const round = (n: number, step: number) => Math.round(n / step) * step;

export class Simulator {
  constructor(private c: SimContext) {}

  private get rng() {
    return this.c.rng;
  }

  private pickAdvisor(): Advisor {
    return this.rng.weighted(this.c.advisors.map((a) => [a, a.weight] as const));
  }

  private bh(d: Date, prev?: Date): Date {
    let out = this.c.clock.toBusinessHours(d, this.rng);
    if (prev && out.getTime() <= prev.getTime()) out = new Date(prev.getTime() + this.rng.int(3, 40) * MIN);
    return out;
  }

  private systemActivity(args: {
    event: SystemEvent;
    at: Date;
    userId: string | null;
    leadId?: string | null;
    clientId?: string | null;
    oppId?: string | null;
    propertyId?: string | null;
    visitId?: string | null;
    meta?: Parameters<typeof eventTitle>[1];
    body?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    this.c.out.activities.push(
      mkActivity({
        type: "system",
        event: args.event,
        title: eventTitle(args.event, args.meta),
        body: args.body ?? null,
        lead_id: args.leadId ?? null,
        client_id: args.clientId ?? null,
        opportunity_id: args.oppId ?? null,
        property_id: args.propertyId ?? null,
        visit_id: args.visitId ?? null,
        user_id: args.userId,
        metadata: json(args.metadata ?? {}),
        occurred_at: args.at,
        created_at: args.at,
      }),
    );
  }

  private pickProperty(op: "sale" | "rent", type: string | null, districts: string[]): SeedProperty | null {
    const open = this.c.pools.open.filter((p) => p.operation === op);
    if (open.length === 0) return null;
    const byType = type ? open.filter((p) => p.propertyType === type) : open;
    const base = byType.length ? byType : open;
    const byDistrict = districts.length ? base.filter((p) => districts.includes(p.district)) : [];
    const pool = byDistrict.length ? byDistrict : base;
    return this.rng.pick(pool);
  }

  private claim(pool: SeedProperty[], op: "sale" | "rent"): SeedProperty | null {
    const idx = pool.findIndex((p) => p.operation === op);
    if (idx >= 0) return pool.splice(idx, 1)[0];
    return pool.length ? pool.splice(0, 1)[0] : null;
  }

  run(plan: LeadPlan): { leadId: string; clientId: string | null } {
    const { rng, clock, out } = this.c;
    const now = clock.now;
    const m = (a: Advisor | null) => (a ? a.mult : 0.8);

    // --- Persona y origen ------------------------------------------------------
    const person = plan.name
      ? { fullName: plan.name, firstName: plan.name.split(" ")[0], lastName: plan.name.split(" ")[1] ?? "", female: false }
      : randomPerson(rng);
    const source =
      plan.source ??
      rng.weighted([
        ["whatsapp", 24],
        ["web", 14],
        ["facebook", 14],
        ["instagram", 10],
        ["google", 10],
        ["portal", 14],
        ["referral", 6],
        ["phone", 5],
        ["walk_in", 3],
      ] as const);
    const srcMult: Record<string, number> = { referral: 1.45, walk_in: 1.35, phone: 1.1, google: 1.1, web: 1.0, whatsapp: 1.0, portal: 0.9, instagram: 0.75, facebook: 0.7 };

    const advisor: Advisor | null =
      plan.advisorId === null ? null : plan.advisorId ? (this.c.advisors.find((a) => a.id === plan.advisorId) ?? this.pickAdvisor()) : this.pickAdvisor();
    const quality = Math.min(1.6, (srcMult[source] ?? 1) * m(advisor));

    // --- Momento de creación ---------------------------------------------------
    let createdAt: Date;
    if (plan.timesAgo) createdAt = new Date(now.getTime() - plan.timesAgo[0] * DAY);
    else if (plan.createdAt) createdAt = plan.createdAt;
    else {
      const daysAgo = Math.floor(118 * Math.pow(rng.next(), 1.35));
      const base = clock.at(-daysAgo, rng.weighted([[9, 4], [10, 6], [11, 7], [12, 6], [13, 4], [14, 5], [15, 6], [16, 6], [17, 5], [18, 5], [19, 4], [20, 3], [21, 2], [22, 1]] as const), rng.int(0, 59));
      createdAt = base.getTime() > now.getTime() ? new Date(now.getTime() - rng.int(10, 180) * MIN) : base;
    }

    // --- Deseo inicial del lead ---------------------------------------------------
    const op0 = plan.operation ?? rng.weighted([["buy", 58], ["rent", 27], ["invest", 9], ["sell", 3]] as const);
    const type0 = plan.profile?.propertyType ?? rng.weighted([["apartment", 52], ["house", 22], ["office", 8], ["commercial", 6], ["land", 6], ["project", 6]] as const);
    const districts0 =
      plan.profile?.districts ??
      rng.sample(
        DISTRICTS.map((d) => d.key),
        rng.weighted([[1, 5], [2, 4], [3, 2]] as const),
      );
    const saleOrRent: "sale" | "rent" = op0 === "rent" ? "rent" : "sale";

    // --- Recorrido (path) ----------------------------------------------------------
    const forced = plan.reach ? PATH.indexOf(plan.reach) : null;
    const maxIdx = op0 === "sell" ? 2 : 8;
    const forward = [advisor ? 0.95 : 0, 0.68, 0.56, 0.78, 0.86, 0.43, 0.56, 0.86];
    const outcome0: VisitOutcome =
      plan.visitOutcomes?.[0] ??
      rng.weighted([["very_interested", 22], ["interested", 30], ["needs_time", 22], ["wants_other", 14], ["not_interested", 12]] as const);
    const outcomeProb: Record<VisitOutcome, number> = { very_interested: 0.88, interested: 0.6, needs_time: 0.32, wants_other: 0.12, not_interested: 0 };

    const times: Date[] = [createdAt];
    let idx = 0;
    let ended: "prob" | "age" | null = null;
    let visitAt: Date | null = null;
    const D = (a: number, b: number) => rng.float(a, b) * DAY;

    for (let i = 0; i < maxIdx; i++) {
      if (forced != null) {
        if (i >= forced) break;
      } else {
        let p = forward[i];
        if (i === 5) p = outcomeProb[outcome0];
        if (i >= 1) p = Math.min(0.97, p * quality);
        if (!rng.chance(p)) {
          ended = "prob";
          break;
        }
      }
      const prev = times[i];
      let next: Date;
      if (plan.timesAgo && plan.timesAgo[i + 1] != null) {
        next = new Date(now.getTime() - plan.timesAgo[i + 1] * DAY);
        if (i === 4) visitAt = new Date(next.getTime() - 50 * MIN);
      } else if (i === 0) {
        const minutes = rng.weighted([[rng.int(2, 15), 35], [rng.int(15, 60), 25], [rng.int(60, 240), 22], [rng.int(240, 1440), 13], [rng.int(1440, 4320), 5]] as const);
        const h = clock.hour(prev);
        let base = prev;
        if (h < 9 || h >= 20) {
          // fuera de horario: se atiende al abrir
          const localMidnight = Math.floor((prev.getTime() - 5 * HOUR) / DAY) * DAY + 5 * HOUR;
          base = new Date(localMidnight + (h >= 20 ? DAY : 0) + 9 * HOUR + rng.int(0, 30) * MIN);
        }
        next = new Date(base.getTime() + minutes * MIN);
      } else if (i === 4) {
        visitAt = this.bh(new Date(prev.getTime() + D(1, 6)));
        next = new Date(visitAt.getTime() + rng.int(40, 110) * MIN);
        // visitas de las últimas 36 h: parte queda sin resultado registrado (alerta para el asesor)
        if (forced == null && visitAt.getTime() <= now.getTime() && now.getTime() - visitAt.getTime() < 36 * HOUR && rng.chance(0.45)) {
          ended = "age";
          break;
        }
      } else {
        const delays: Record<number, [number, number]> = { 1: [0.3, 3], 2: [0.5, 4], 3: [0.2, 2], 5: [1, 6], 6: [2, 12], 7: [6, 25] };
        const [a, b] = delays[i];
        next = this.bh(new Date(prev.getTime() + D(a, b)), prev);
      }
      if (next.getTime() > now.getTime()) {
        ended = "age";
        break;
      }
      idx = i + 1;
      times.push(next);
    }

    // --- Estado de la visita cuando el lead quedó en "visita programada" -------------------------
    let futureVisitAt: Date | null = null;
    let unresolvedVisit = false;
    let failedVisit: "cancelled" | "no_show" | null = null;
    if (idx === 4) {
      if (!visitAt) {
        if (ended === "prob") {
          visitAt = this.bh(new Date(times[4].getTime() + D(1, 6)));
          if (visitAt.getTime() > now.getTime() - 3 * HOUR) visitAt = new Date(now.getTime() - rng.int(3, 30) * HOUR);
          if (visitAt.getTime() <= times[4].getTime()) visitAt = new Date(times[4].getTime() + 2 * HOUR);
          failedVisit = rng.chance(0.5) ? "cancelled" : "no_show";
        } else if (plan.visitAtOffset) {
          visitAt = clock.at(plan.visitAtOffset.day, plan.visitAtOffset.hour, plan.visitAtOffset.minute ?? 0);
          futureVisitAt = visitAt;
        } else {
          visitAt = this.bh(new Date(now.getTime() + D(0.3, 5)));
          if (visitAt.getTime() <= now.getTime()) visitAt = new Date(now.getTime() + rng.int(3, 30) * HOUR);
          futureVisitAt = visitAt;
        }
      } else if (ended === "age") {
        if (visitAt.getTime() > now.getTime()) futureVisitAt = visitAt;
        else unresolvedVisit = true;
      } else if (ended === "prob") {
        failedVisit = rng.chance(0.5) ? "cancelled" : "no_show";
      }
    }

    let forceLost = false;
    if (idx >= 5 && outcome0 === "not_interested") forceLost = true;

    // --- ¿Perdido? -------------------------------------------------------------------
    let lost = false;
    let lostAt: Date | null = null;
    if (plan.end === "lost") lost = true;
    else if (idx < 8 && plan.end !== "open") {
      if (forceLost) lost = true;
      else if (ended === "prob") {
        const since = now.getTime() - times[idx].getTime();
        if (since > rng.int(10, 26) * DAY && rng.chance(0.78)) lost = true;
      } else if (ended === "age" && idx >= 1 && now.getTime() - times[idx].getTime() > 40 * DAY && rng.chance(0.7)) lost = true;
    }
    if (lost) {
      const wait = rng.int(2, 12) * DAY;
      const candidate = new Date(times[idx].getTime() + wait);
      lostAt = candidate.getTime() < now.getTime() ? candidate : new Date(now.getTime() - rng.int(2, 40) * HOUR);
      if (lostAt.getTime() <= times[idx].getTime()) lostAt = new Date(times[idx].getTime() + 20 * MIN);
      futureVisitAt = null;
      unresolvedVisit = false;
    }

    // --- Propiedad ------------------------------------------------------------------------
    let property: SeedProperty | null = null;
    const noProperty = op0 === "sell";
    if (!noProperty) {
      if (plan.property) property = plan.property;
      else if (!lost && idx === 8) property = this.claim(saleOrRent === "rent" ? this.c.pools.rentedFree : this.c.pools.soldFree, saleOrRent) ?? this.claim(saleOrRent === "rent" ? this.c.pools.soldFree : this.c.pools.rentedFree, saleOrRent);
      else if (!lost && idx === 7) property = this.claim(this.c.pools.reservedFree, saleOrRent);
      if (!property && !lost && (idx === 8 || idx === 7)) {
        // sin inventario para cerrar/reservar: se queda en negociación
        idx = 6;
        times.length = 7;
      }
      if (!property) {
        const wantsProperty = idx >= 2 || rng.chance(["portal", "web", "facebook", "instagram", "google"].includes(source) ? 0.85 : 0.6);
        if (wantsProperty) property = this.pickProperty(saleOrRent, type0, districts0);
      }
    }

    // --- Perfil de búsqueda ---------------------------------------------------------------------
    const full = idx >= 2;
    const partial = idx >= 1;
    const prof: Row = {
      operation_type: null,
      property_type: null,
      budget_min: null,
      budget_max: null,
      currency: "PEN",
      districts: [] as string[],
      bedrooms_min: null,
      bathrooms_min: null,
      area_min: null,
      area_max: null,
      financing: null,
      interest_level: null,
      purchase_date: null,
    };
    const pp = plan.profile ?? {};
    const opType = property ? (property.operation === "rent" ? "rent" : op0 === "invest" ? "invest" : "buy") : op0;
    prof.operation_type = partial || property ? opType : null;
    prof.property_type = property?.propertyType ?? (partial ? type0 : null);
    prof.districts = pp.districts ?? (property ? [property.district, ...DISTRICTS.filter((d) => d.key !== property!.district && areNearby(d.key, property!.district)).map((d) => d.key).filter(() => rng.chance(0.35)).slice(0, 2)] : partial ? districts0 : []);
    if (property && (full || rng.chance(0.3))) {
      const sale = property.operation === "sale";
      const cur = pp.currency ?? (rng.chance(0.85) ? property.currency : property.currency === "USD" ? "PEN" : "USD");
      const rate = 3.75;
      const price = cur === property.currency ? property.price : property.currency === "USD" ? property.price * rate : property.price / rate;
      const step = sale ? (cur === "USD" ? 5000 : 10000) : cur === "USD" ? 50 : 100;
      const max = pp.budgetMax ?? round(price * rng.float(1.0, 1.14), step);
      const min = pp.budgetMin ?? round(max * rng.float(0.78, 0.9), step);
      prof.currency = cur;
      prof.budget_max = max;
      prof.budget_min = min;
      prof.bedrooms_min = pp.bedroomsMin ?? (property.bedrooms ? Math.max(1, property.bedrooms - (rng.chance(0.3) ? 1 : 0)) : null);
      prof.bathrooms_min = pp.bathroomsMin ?? (property.bathrooms && rng.chance(0.4) ? Math.max(1, property.bathrooms - 1) : null);
      const area = property.totalArea ?? property.builtArea;
      prof.area_min = pp.areaMin ?? (area ? Math.floor((area * rng.float(0.8, 0.95)) / 5) * 5 : null);
      prof.area_max = pp.areaMax ?? (area && rng.chance(0.35) ? Math.ceil((area * 1.3) / 10) * 10 : null);
    } else if (partial && rng.chance(0.4) && op0 !== "sell") {
      const d = districtByKey(districts0[0] ?? "surco");
      const area = rng.int(60, 140);
      const val = area * d.ppm;
      prof.budget_max = op0 === "rent" ? round(val * 0.0046 * 1.1, 100) : round(val * 1.1, 10000);
    }
    if (full && op0 !== "sell") {
      prof.financing = plan.financing ?? (saleOrRent === "rent" ? null : rng.weighted([["cash", 22], ["mortgage", 48], ["undecided", 30]] as const));
      prof.interest_level = plan.interestLevel ?? rng.weighted([["low", 12], ["medium", 38], ["high", 36], ["urgent", 14]] as const);
      prof.purchase_date = new Date(now.getTime() + (pp.purchaseInDays ?? rng.int(15, 240)) * DAY).toISOString().slice(0, 10);
    } else if (partial && plan.interestLevel) {
      prof.interest_level = plan.interestLevel;
    }

    // --- Identificadores y filas base ---------------------------------------------------------
    const leadId = uuid();
    const phone = plan.phone ?? phoneFor(rng, this.c.phones);
    const email = plan.email ?? (rng.chance(0.78) ? emailFor(rng, person.fullName) : null);
    const automated = ["whatsapp", "web", "facebook", "instagram", "google", "portal"].includes(source);
    const createdBy = automated ? null : source === "phone" || source === "walk_in" ? this.c.assistant.id : (advisor?.id ?? this.c.assistant.id);
    const assignedAt = advisor ? new Date(createdAt.getTime() + rng.int(4, 50) * MIN) : null;
    if (assignedAt && times[1] && assignedAt.getTime() >= times[1].getTime()) assignedAt.setTime(times[1].getTime() - 90_000);
    if (assignedAt && assignedAt.getTime() <= createdAt.getTime()) assignedAt.setTime(createdAt.getTime() + 60_000);

    // Prioridad
    const priority = plan.priority ?? (lost ? "low" : rng.weighted([["low", 20], ["medium", 45], ["high", 28], ["urgent", 7]] as const));

    const stageFinal = lost ? "lost" : LEAD_STAGE_OF[PATH[idx]];
    const lastEvent = new Date(Math.min(now.getTime(), Math.max(...times.map((t) => t.getTime()), lostAt?.getTime() ?? 0)));

    const code = property?.code;
    const msg =
      plan.messageText ??
      (property
        ? rng.pick([
            `Hola, vi ${property.title} (${property.code}) y quisiera más información.`,
            `Buenas, me interesa ${property.code}. ¿Sigue disponible?`,
            `Quisiera coordinar una visita para ${property.title}.`,
            `¿Cuál es el precio final de ${property.code} y qué gastos adicionales tiene?`,
          ])
        : rng.pick([
            "Hola, busco una propiedad en la zona. ¿Qué opciones tienen?",
            "Buenas tardes, quisiera información sobre alquileres disponibles.",
            "Estoy buscando comprar mi primera vivienda, ¿me pueden asesorar?",
            op0 === "sell" ? "Quiero vender mi propiedad, ¿cómo es el proceso con ustedes?" : "Quisiera conocer opciones de inversión inmobiliaria.",
          ]));

    out.leads.push(
      mkLead({
        id: leadId,
        full_name: person.fullName,
        phone,
        email,
        source,
        stage: stageFinal,
        priority,
        assigned_to: advisor?.id ?? null,
        assigned_at: assignedAt,
        property_id: property?.id ?? null,
        message: msg,
        ...prof,
        lost_reason: null,
        created_by: createdBy,
        created_at: createdAt,
        updated_at: lostAt ?? lastEvent,
      }),
    );
    const leadRow = out.leads[out.leads.length - 1];

    // Etiquetas
    const tagNames = new Set<string>(plan.tags ?? []);
    if (!plan.tags) {
      if (op0 === "invest") tagNames.add("Inversionista");
      if (prof.interest_level === "urgent") tagNames.add("Compra urgente");
      if (saleOrRent === "rent" && partial) tagNames.add("Alquiler");
      if (prof.financing === "mortgage" && rng.chance(0.7)) tagNames.add("Crédito hipotecario");
      if ((prof.budget_max as number | null) && (prof.currency === "USD" ? (prof.budget_max as number) >= 300000 : (prof.budget_max as number) >= 1_000_000) && saleOrRent === "sale" && rng.chance(0.6)) tagNames.add("VIP");
      const ds = prof.districts as string[];
      if (ds.includes("surco") && rng.chance(0.7)) tagNames.add("Surco");
      if (ds.includes("san_miguel") && rng.chance(0.7)) tagNames.add("San Miguel");
      if (source === "referral" && rng.chance(0.4)) tagNames.add("Cliente recurrente");
    }
    for (const t of tagNames) if (this.c.tagIds[t]) out.leadTags.push({ lead_id: leadId, tag_id: this.c.tagIds[t] });

    // --- Historial de etapas del lead -----------------------------------------------------------------
    const leadStageSeq: Array<{ stage: string; at: Date }> = [];
    for (let i = 0; i <= idx; i++) {
      const st = LEAD_STAGE_OF[PATH[i]];
      if (!leadStageSeq.length || leadStageSeq[leadStageSeq.length - 1].stage !== st) leadStageSeq.push({ stage: st, at: i === 0 ? createdAt : times[i] });
    }
    if (lost && lostAt) leadStageSeq.push({ stage: "lost", at: lostAt });
    leadStageSeq.forEach((s, i) => {
      out.stageHistory.push({
        id: uuid(),
        entity_type: "lead",
        entity_id: leadId,
        stage: s.stage,
        entered_at: s.at,
        exited_at: leadStageSeq[i + 1]?.at ?? null,
        changed_by: i === 0 ? createdBy : advisor?.id ?? null,
      });
    });

    // --- Actividades del lead ------------------------------------------------------------------------------
    this.systemActivity({
      event: "lead_created",
      at: createdAt,
      userId: createdBy,
      leadId,
      propertyId: property?.id,
      body: `Origen: ${this.c.sourceLabel(source)}${msg ? ` · "${msg}"` : ""}`,
      metadata: { source },
    });
    if (advisor && assignedAt) {
      const assigner = rng.weighted([[this.c.manager.id, 6], [this.c.assistant.id, 3], [null, 1]] as const);
      this.systemActivity({ event: "assigned", at: assignedAt, userId: assigner, leadId, meta: { to: advisor.name }, metadata: { to: advisor.id } });
      if (assigner) {
        out.audit.push(this.auditRow("leads", leadId, person.fullName, "assignment", { assigned_to: { from: null, to: advisor.id } }, assigner, assignedAt));
      }
    }

    // Primer contacto
    const respondedLead = idx >= 2 ? true : idx === 1 ? rng.chance(0.6) : false;
    let firstContactAt: Date | null = null;
    if (idx >= 1 && advisor) {
      firstContactAt = times[1];
      const ch = rng.weighted([["whatsapp", 52], ["call", 38], ["email", 10]] as const);
      const bodyPool = ch === "call" ? (respondedLead ? TEXT.callAnswered : TEXT.callUnanswered) : ch === "whatsapp" ? (respondedLead ? TEXT.whatsappAnswered : TEXT.whatsappUnanswered) : TEXT.email;
      out.activities.push(
        mkActivity({
          type: ch,
          title: ch === "call" ? "Llamada de primer contacto" : ch === "whatsapp" ? "WhatsApp de primer contacto" : "Email de presentación",
          body: rng.pick(bodyPool),
          responded: ch === "email" ? null : respondedLead,
          direction: "outbound",
          lead_id: leadId,
          property_id: property?.id ?? null,
          user_id: advisor.id,
          occurred_at: firstContactAt,
          created_at: firstContactAt,
        }),
      );
      this.systemActivity({ event: "stage_changed", at: new Date(firstContactAt.getTime() + 60_000), userId: advisor.id, leadId, meta: { from: "Nuevo", to: "Contactado" } });
    }
    // Reintentos si no respondió
    if (idx === 1 && !respondedLead && advisor) {
      const attempts = rng.int(1, 2);
      for (let k = 1; k <= attempts; k++) {
        const at = new Date(Math.min(now.getTime() - 5 * MIN, times[1].getTime() + k * rng.int(1, 3) * DAY));
        if (at.getTime() <= times[1].getTime()) continue;
        const ch = rng.chance(0.5) ? "whatsapp" : "call";
        out.activities.push(
          mkActivity({
            type: ch,
            title: ch === "call" ? "Llamada de seguimiento" : "WhatsApp de seguimiento",
            body: ch === "call" ? rng.pick(TEXT.callUnanswered) : rng.pick(TEXT.whatsappUnanswered),
            responded: false,
            lead_id: leadId,
            property_id: property?.id ?? null,
            user_id: advisor.id,
            occurred_at: this.bh(at),
            created_at: this.bh(at),
          }),
        );
      }
    }

    // Calificación
    if (idx >= 2 && advisor) {
      const at = times[2];
      const noteId = uuid();
      const body = rng.pick(TEXT.qualification);
      out.notes.push(mkNote({ id: noteId, body, author_id: advisor.id, lead_id: leadId, created_at: at, updated_at: at }));
      out.activities.push(mkActivity({ type: "call", title: "Llamada de calificación", body: rng.pick(TEXT.callAnswered), responded: true, lead_id: leadId, user_id: advisor.id, occurred_at: new Date(at.getTime() - 25 * MIN), created_at: new Date(at.getTime() - 25 * MIN) }));
      out.activities.push(mkActivity({ type: "note", title: "Nota agregada", body: null, note_id: noteId, lead_id: leadId, user_id: advisor.id, occurred_at: at, created_at: at }));
      this.systemActivity({ event: "qualified", at: new Date(at.getTime() + 60_000), userId: advisor.id, leadId });
      this.systemActivity({ event: "stage_changed", at: new Date(at.getTime() + 120_000), userId: advisor.id, leadId, meta: { from: "Contactado", to: "Calificado" } });
    }

    // Propiedades enviadas / oportunidad
    let oppId: string | null = null;
    const oppStageSeq: Array<{ stage: string; at: Date }> = [];
    let clientId: string | null = null;
    let clientCreatedAt: Date | null = null;
    const finalValue = property
      ? property.operation === "rent"
        ? property.price * 12
        : idx === 8 && !lost
          ? round(property.price * rng.float(0.94, 0.995), property.currency === "USD" ? 500 : 2500)
          : (plan.value ?? property.price)
      : 0;

    const earlyOpp = idx <= 1 && !lost && Boolean(property) && Boolean(advisor) && rng.chance(0.18);
    if (property && advisor && (idx >= 2 || earlyOpp)) {
      const startIdx = idx >= 2 ? 2 : 0;
      const oppStart = startIdx === 0 ? new Date(createdAt.getTime() + 6 * MIN) : times[2];
      oppId = uuid();
      const stageKey = lost ? "lost" : PATH[idx];
      // Etapas por las que pasó la oportunidad
      for (let i = startIdx; i <= idx; i++) oppStageSeq.push({ stage: PATH[i], at: i === startIdx ? oppStart : times[i] });
      if (lost && lostAt) oppStageSeq.push({ stage: "lost", at: lostAt });
      const lossReason = lost ? this.lossFor(plan.lostReason, idx, forceLost) : null;
      const wonAt = !lost && idx === 8 ? times[8] : null;
      const prob = lost ? 0 : idx === 8 ? 100 : idx === 6 ? (plan.probability ?? rng.weighted([[75, 70], [50, 20], [90, 10]] as const)) : PROB[PATH[idx]];
      const expected = lost || idx === 8 ? null : new Date(now.getTime() + rng.int(5, 45) * DAY).toISOString().slice(0, 10);
      out.opportunities.push(
        mkOpp({
          id: oppId,
          lead_id: leadId,
          property_id: property.id,
          assigned_to: advisor.id,
          stage: stageKey,
          value: finalValue,
          currency: property.currency,
          probability: prob,
          priority,
          operation: property.operation,
          expected_close_date: expected,
          next_step: lost || idx === 8 ? null : this.nextStepText(idx),
          stage_changed_at: oppStageSeq[oppStageSeq.length - 1].at,
          won_at: wonAt,
          lost_at: lost ? lostAt : null,
          lost_reason: lossReason,
          lost_notes: lost ? "Seguimiento cerrado tras comunicación con el cliente." : null,
          created_by: advisor.id,
          created_at: oppStart,
          updated_at: lostAt ?? oppStageSeq[oppStageSeq.length - 1].at,
        }),
      );
      oppStageSeq.forEach((s, i) => {
        out.stageHistory.push({ id: uuid(), entity_type: "opportunity", entity_id: oppId!, stage: s.stage, entered_at: s.at, exited_at: oppStageSeq[i + 1]?.at ?? null, changed_by: advisor.id });
        if (i > 0 && s.stage !== "lost") {
          out.audit.push(this.auditRow("opportunities", oppId!, `${person.fullName} · ${property!.code}`, "stage_change", { stage: { from: oppStageSeq[i - 1].stage, to: s.stage } }, advisor.id, s.at));
        }
      });
      if (lost && lostAt) {
        out.audit.push(this.auditRow("opportunities", oppId, `${person.fullName} · ${property.code}`, "stage_change", { stage: { from: oppStageSeq[oppStageSeq.length - 2]?.stage ?? "qualified", to: "lost" }, lost_reason: { from: null, to: lossReason } }, advisor.id, lostAt));
      }
      this.systemActivity({ event: "property_sent", at: new Date(oppStart.getTime() + 8 * MIN), userId: advisor.id, leadId, oppId, propertyId: property.id, meta: { code }, body: "Se compartió ficha, fotos y ubicación." });
      this.systemActivity({ event: "opportunity_created", at: new Date(oppStart.getTime() + 15 * MIN), userId: advisor.id, leadId, oppId, propertyId: property.id, meta: { code } });
      for (let i = 1; i < oppStageSeq.length; i++) {
        const s = oppStageSeq[i];
        if (s.stage === "lost") continue;
        const ev: SystemEvent = s.stage === "negotiation" ? "negotiation_started" : s.stage === "reserved" ? "reserved" : s.stage === "won" ? "won" : "opportunity_stage";
        this.systemActivity({
          event: ev,
          at: new Date(s.at.getTime() + 2 * MIN),
          userId: advisor.id,
          leadId,
          oppId,
          propertyId: property.id,
          meta: { from: PIPE_LABEL[oppStageSeq[i - 1].stage], to: PIPE_LABEL[s.stage], code, value: `${property.currency === "USD" ? "US$" : "S/"} ${Math.round(finalValue).toLocaleString("en-US")}` },
        });
      }
    }

    // Visitas ---------------------------------------------------------------------------------------------------
    if (property && advisor && oppId && idx >= 4) {
      const scheduledAt = times[4];
      const vAt = visitAt as Date;
      const pushVisit = (args: { at: Date; status: string; outcome: string | null; notes: string | null; created: Date; from?: string | null }) => {
        const vid = uuid();
        const confirmed = args.status === "confirmed" || args.status === "completed";
        out.visits.push(
          mkVisit({
            id: vid,
            property_id: property!.id,
            lead_id: leadId,
            opportunity_id: oppId,
            advisor_id: advisor.id,
            scheduled_at: args.at,
            duration_min: rng.pick([30, 45, 45, 60]),
            status: args.status,
            outcome: args.outcome,
            advisor_notes: args.notes,
            observations: rng.chance(0.3) ? rng.pick(["Coordinar ingreso con portería.", "Cliente llegará acompañado de su pareja.", "Llevar llaves de la cochera.", "Confirmar 1 hora antes."]) : null,
            cancel_reason: args.status === "cancelled" ? rng.pick(["El cliente tuvo un imprevisto de trabajo.", "Se reprogramará por lluvia.", "El cliente decidió esperar."]) : null,
            rescheduled_from: args.from ?? null,
            confirmed_at: confirmed ? new Date(args.at.getTime() - rng.int(3, 26) * HOUR) : null,
            completed_at: args.status === "completed" ? new Date(args.at.getTime() + rng.int(40, 100) * MIN) : null,
            created_by: advisor.id,
            created_at: args.created,
            updated_at: args.status === "completed" ? new Date(args.at.getTime() + 60 * MIN) : args.created,
          }),
        );
        return vid;
      };
      const oppForVisit = oppId;
      const logScheduled = (vid: string, at: Date) =>
        this.systemActivity({ event: "visit_scheduled", at: new Date(at.getTime() + 3 * MIN), userId: advisor.id, leadId, oppId: oppForVisit, propertyId: property!.id, visitId: vid, meta: { code } });
      const fate = idx >= 5 ? rng.weighted([["completed", 86], ["cancelled", 5], ["no_show", 5], ["rescheduled", 4]] as const) : "pending";

      if (futureVisitAt) {
        const soon = futureVisitAt.getTime() - now.getTime() < 2 * DAY;
        const status = plan.visitStatus ?? (soon ? (rng.chance(0.7) ? "confirmed" : "scheduled") : rng.chance(0.3) ? "confirmed" : "scheduled");
        const vid = pushVisit({ at: futureVisitAt, status, outcome: null, notes: null, created: scheduledAt });
        logScheduled(vid, scheduledAt);
        if (status === "confirmed") this.systemActivity({ event: "visit_confirmed", at: new Date(Math.min(now.getTime() - 30 * MIN, futureVisitAt.getTime() - 4 * HOUR)), userId: advisor.id, leadId, oppId, propertyId: property.id, visitId: vid, meta: { code } });
      } else if (unresolvedVisit) {
        const vid = pushVisit({ at: vAt, status: "confirmed", outcome: null, notes: null, created: scheduledAt });
        logScheduled(vid, scheduledAt);
      } else if (idx >= 5) {
        // la visita se realizó
        let at = vAt;
        let vid: string;
        if (fate !== "completed" && fate !== "pending") {
          // primera cita fallida y reprogramada
          const failed = fate as "cancelled" | "no_show" | "rescheduled";
          const failId = pushVisit({ at: vAt, status: failed, outcome: null, notes: null, created: scheduledAt });
          logScheduled(failId, scheduledAt);
          this.systemActivity({ event: failed === "no_show" ? "visit_no_show" : failed === "cancelled" ? "visit_cancelled" : "visit_rescheduled", at: new Date(vAt.getTime() + 20 * MIN), userId: advisor.id, leadId, oppId, propertyId: property.id, visitId: failId, meta: { code } });
          at = this.bh(new Date(vAt.getTime() + rng.int(2, 4) * DAY));
          if (at.getTime() > times[5].getTime() - 45 * MIN) at = new Date(times[5].getTime() - 50 * MIN);
          vid = pushVisit({ at, status: "completed", outcome: outcome0, notes: rng.pick(TEXT.visitNotes[outcome0]), created: new Date(vAt.getTime() + 25 * MIN), from: failId });
          logScheduled(vid, new Date(vAt.getTime() + 25 * MIN));
        } else {
          vid = pushVisit({ at, status: "completed", outcome: outcome0, notes: rng.pick(TEXT.visitNotes[outcome0]), created: scheduledAt });
          logScheduled(vid, scheduledAt);
        }
        const doneAt = new Date(at.getTime() + rng.int(45, 90) * MIN);
        this.systemActivity({ event: "visit_completed", at: doneAt, userId: advisor.id, leadId, oppId, propertyId: property.id, visitId: vid, meta: { code, outcome: labelOf(VISIT_OUTCOMES, outcome0) }, body: `Resultado: ${labelOf(VISIT_OUTCOMES, outcome0)}` });
        out.activities.push(mkActivity({ type: "visit", title: `Visita a ${property.code} · ${labelOf(VISIT_OUTCOMES, outcome0)}`, body: rng.pick(TEXT.visitNotes[outcome0]), lead_id: leadId, opportunity_id: oppId, property_id: property.id, visit_id: vid, user_id: advisor.id, occurred_at: doneAt, created_at: doneAt }));
        this.systemActivity({ event: "stage_changed", at: new Date(doneAt.getTime() + 2 * MIN), userId: advisor.id, leadId, meta: { from: "Oportunidad", to: "Visita" } });
        // Visita extra a otra opción si "desea otra propiedad"
        if (outcome0 === "wants_other" && !lost) {
          const other = this.pickProperty(property.operation, property.propertyType, [property.district]);
          if (other && other.id !== property.id) {
            const at2 = this.bh(new Date(doneAt.getTime() + rng.int(2, 5) * DAY));
            const past = at2.getTime() < now.getTime();
            const vid2 = uuid();
            out.visits.push(
              mkVisit({
                id: vid2,
                property_id: other.id,
                lead_id: leadId,
                opportunity_id: oppId,
                advisor_id: advisor.id,
                scheduled_at: at2,
                status: past ? "completed" : "scheduled",
                outcome: past ? "interested" : null,
                advisor_notes: past ? "Segunda opción mostrada; le gustó más la distribución." : null,
                confirmed_at: past ? new Date(at2.getTime() - 5 * HOUR) : null,
                completed_at: past ? new Date(at2.getTime() + 55 * MIN) : null,
                created_by: advisor.id,
                created_at: new Date(doneAt.getTime() + 30 * MIN),
                updated_at: past ? at2 : doneAt,
              }),
            );
            this.systemActivity({ event: "property_sent", at: new Date(doneAt.getTime() + 30 * MIN), userId: advisor.id, leadId, oppId, propertyId: other.id, meta: { code: other.code } });
            this.systemActivity({ event: "visit_scheduled", at: new Date(doneAt.getTime() + 31 * MIN), userId: advisor.id, leadId, oppId, propertyId: other.id, visitId: vid2, meta: { code: other.code } });
          }
        }
      } else if (failedVisit) {
        const vid = pushVisit({ at: vAt, status: failedVisit, outcome: null, notes: null, created: scheduledAt });
        logScheduled(vid, scheduledAt);
        this.systemActivity({ event: failedVisit === "no_show" ? "visit_no_show" : "visit_cancelled", at: new Date(vAt.getTime() + 20 * MIN), userId: advisor.id, leadId, oppId, propertyId: property.id, visitId: vid, meta: { code } });
      }
    }

    // Seguimiento en negociación
    if (idx >= 6 && advisor && oppId) {
      const n = plan.stalled ? 0 : rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const at = new Date(Math.min(now.getTime() - 10 * MIN, times[6].getTime() + (k + 1) * rng.int(1, 4) * DAY));
        if (at.getTime() <= times[6].getTime()) continue;
        const ch = rng.pick(["call", "whatsapp", "meeting"] as const);
        out.activities.push(
          mkActivity({
            type: ch,
            title: ch === "call" ? "Llamada de negociación" : ch === "whatsapp" ? "WhatsApp de negociación" : "Reunión de negociación",
            body: rng.pick(TEXT.negotiation),
            responded: ch === "meeting" ? null : true,
            lead_id: leadId,
            opportunity_id: oppId,
            property_id: property?.id ?? null,
            user_id: advisor.id,
            occurred_at: this.bh(at),
            created_at: this.bh(at),
          }),
        );
      }
      const noteAt = new Date(Math.min(now.getTime() - 5 * MIN, times[6].getTime() + 8 * HOUR));
      const noteId = uuid();
      out.notes.push(mkNote({ id: noteId, body: rng.pick(TEXT.negotiation), author_id: advisor.id, lead_id: leadId, opportunity_id: oppId, created_at: noteAt, updated_at: noteAt }));
      out.activities.push(mkActivity({ type: "note", title: "Nota agregada", note_id: noteId, lead_id: leadId, opportunity_id: oppId, user_id: advisor.id, occurred_at: noteAt, created_at: noteAt }));
    }

    // Conversión a cliente -------------------------------------------------------------------------------------------
    const shouldConvert = !lost && advisor && (plan.convertToClient || idx === 8 || (idx >= 5 && rng.chance(0.45)));
    if (shouldConvert) {
      clientId = uuid();
      clientCreatedAt = new Date(Math.min(now.getTime() - 5 * MIN, (idx === 8 ? times[6] : times[Math.min(idx, 5)]).getTime() + 30 * MIN));
      out.clients.push(
        mkClient({
          id: clientId,
          full_name: person.fullName,
          doc_type: "dni",
          doc_number: rng.chance(0.7) ? dniFor(rng) : null,
          phone,
          email,
          address: rng.chance(0.4) ? `${rng.pick(DISTRICTS).streets[0]} ${rng.int(100, 2500)}, Lima` : null,
          source,
          assigned_to: advisor!.id,
          operation_type: prof.operation_type,
          property_type: prof.property_type,
          budget_min: prof.budget_min,
          budget_max: prof.budget_max,
          currency: prof.currency,
          districts: prof.districts,
          bedrooms_min: prof.bedrooms_min,
          bathrooms_min: prof.bathrooms_min,
          area_min: prof.area_min,
          area_max: prof.area_max,
          financing: prof.financing,
          purchase_date: prof.purchase_date,
          created_by: advisor!.id,
          created_at: clientCreatedAt,
          updated_at: lastEvent,
        }),
      );
      leadRow.client_id = clientId;
      leadRow.converted_at = clientCreatedAt;
      if (oppId) {
        const o = out.opportunities.find((r) => r.id === oppId)!;
        o.client_id = clientId;
      }
      out.activities.push(mkActivity({ type: "system", event: "converted", title: eventTitle("converted"), lead_id: leadId, client_id: clientId, user_id: advisor!.id, occurred_at: clientCreatedAt, created_at: clientCreatedAt }));
      out.activities.push(mkActivity({ type: "system", event: "client_created", title: eventTitle("client_created"), client_id: clientId, lead_id: leadId, user_id: advisor!.id, occurred_at: clientCreatedAt, created_at: clientCreatedAt }));
      for (const t of tagNames) if (this.c.tagIds[t]) out.clientTags.push({ client_id: clientId, tag_id: this.c.tagIds[t] });
      // Las actividades posteriores a la conversión también se vinculan al cliente
    }

    // Pérdida
    if (lost && lostAt) {
      const reason = (out.opportunities.find((r) => r.id === oppId)?.lost_reason as string | undefined) ?? this.lossFor(plan.lostReason, idx, forceLost);
      leadRow.lost_reason = reason;
      leadRow.lost_notes = "Seguimiento cerrado tras comunicación con el cliente.";
      leadRow.lost_at = lostAt;
      this.systemActivity({ event: "lost", at: lostAt, userId: advisor?.id ?? null, leadId, oppId, propertyId: property?.id, meta: { reason: this.c.lossLabel(reason) } });
      out.audit.push(this.auditRow("leads", leadId, person.fullName, "stage_change", { stage: { from: LEAD_STAGE_OF[PATH[idx]], to: "lost" }, lost_reason: { from: null, to: reason } }, advisor?.id ?? this.c.manager.id, lostAt));
    }

    // --- Tareas -------------------------------------------------------------------------------------------------------------
    this.emitTasks({ leadId, clientId, oppId, person, advisor, idx, lost, ended, property, times, now, plan, priority, futureVisitAt, unresolvedVisit, respondedLead, createdAt });

    // Contactos recientes: los leads en gestión se trabajan a diario; una minoría queda sin movimiento (genera alertas)
    if (!lost && advisor && idx >= 1 && idx < 8 && !plan.stalled && !plan.timesAgo) {
      const worked = ended === "age" ? rng.chance(0.93) : rng.chance(0.5);
      if (worked) {
        const n = rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          const at = this.bh(new Date(now.getTime() - rng.float(0.15, 5.5) * DAY));
          if (at.getTime() <= lastEvent.getTime() || at.getTime() > now.getTime()) continue;
          const ch = rng.pick(["call", "whatsapp", "whatsapp"] as const);
          const responded = rng.chance(0.7);
          out.activities.push(
            mkActivity({
              type: ch,
              title: ch === "call" ? "Llamada de seguimiento" : "WhatsApp de seguimiento",
              body: ch === "call" ? rng.pick(responded ? TEXT.callAnswered : TEXT.callUnanswered) : rng.pick(responded ? TEXT.whatsappAnswered : TEXT.whatsappUnanswered),
              responded,
              direction: ch === "whatsapp" && responded && rng.chance(0.4) ? "inbound" : "outbound",
              lead_id: leadId,
              client_id: clientId,
              opportunity_id: oppId,
              property_id: property?.id ?? null,
              user_id: advisor.id,
              occurred_at: at,
              created_at: at,
            }),
          );
        }
      }
    }

    return { leadId, clientId };
  }

  private nextStepText(idx: number): string {
    return [
      "Contactar y presentar la propiedad",
      "Realizar llamada de calificación",
      "Enviar fichas técnicas y fotos",
      "Coordinar visita a la propiedad",
      "Confirmar asistencia a la visita",
      "Registrar resultado y proponer siguiente paso",
      "Enviar propuesta y definir condiciones",
      "Gestionar firma de contrato",
    ][Math.min(idx, 7)];
  }

  private lossFor(forced: string | undefined, idx: number, forceLost: boolean): string {
    if (forced) return forced;
    const { rng } = this.c;
    if (idx <= 1) return rng.weighted([["no_response", 70], ["postponed", 12], ["other", 8], ["price", 10]] as const);
    if (forceLost) return rng.weighted([["features", 35], ["price", 25], ["location", 25], ["other_property", 15]] as const);
    if (idx <= 3) return rng.weighted([["price", 25], ["other_property", 22], ["no_response", 20], ["postponed", 18], ["no_financing", 10], ["other", 5]] as const);
    if (idx <= 5) return rng.weighted([["price", 30], ["location", 15], ["features", 15], ["other_property", 22], ["no_financing", 10], ["competition", 8]] as const);
    return rng.weighted(LOSS_REASON_WEIGHTS);
  }

  private auditRow(entity: string, id: string, label: string, event: string, changes: Record<string, { from: unknown; to: unknown }>, userId: string | null, at: Date): Row {
    return { id: uuid(), user_id: userId, entity_type: entity, entity_id: id, entity_label: label, action: "update", event, changes: json(changes), created_at: at };
  }

  private emitTasks(a: {
    leadId: string;
    clientId: string | null;
    oppId: string | null;
    person: { fullName: string; firstName: string };
    advisor: Advisor | null;
    idx: number;
    lost: boolean;
    ended: "prob" | "age" | null;
    property: SeedProperty | null;
    times: Date[];
    now: Date;
    plan: LeadPlan;
    priority: string;
    futureVisitAt: Date | null;
    unresolvedVisit: boolean;
    respondedLead: boolean;
    createdAt: Date;
  }) {
    const { rng, clock, out } = this.c;
    const { advisor, idx, now } = a;
    if (!advisor) return;
    const nm = a.person.fullName;
    const title = (kind: string) => (TEXT.taskTitles[kind] ?? TEXT.taskTitles.follow_up)(nm);
    const base = { lead_id: a.leadId, client_id: a.clientId, opportunity_id: a.oppId, property_id: a.property?.id ?? null, assigned_to: advisor.id, created_by: advisor.id, priority: a.priority };

    // Historial: tareas completadas asociadas a cada avance
    const doneKinds: Record<number, string> = { 1: "call", 2: "call", 3: "send_properties", 4: "visit", 5: "follow_up", 6: "follow_up", 7: "document", 8: "document" };
    for (let i = 1; i <= idx; i++) {
      if (!rng.chance(0.55)) continue;
      const done = a.times[i];
      const due = new Date(done.getTime() - rng.int(10, 120) * MIN);
      out.tasks.push(mkTask({ ...base, title: title(doneKinds[i] ?? "follow_up"), kind: doneKinds[i] ?? "follow_up", due_at: due, status: "completed", completed_at: done, created_at: new Date(due.getTime() - rng.int(4, 40) * HOUR), updated_at: done }));
    }
    if (a.lost || idx === 8) return;

    // Forzadas por el plan
    if (a.plan.tasks) {
      for (const t of a.plan.tasks) {
        const due = clock.at(t.dueDay, t.hour, t.minute ?? 0);
        const isDone = t.done ?? false;
        out.tasks.push(mkTask({ ...base, title: t.title, kind: t.kind, due_at: due, status: isDone ? "completed" : "pending", completed_at: isDone ? due : null, created_at: new Date(Math.min(now.getTime(), due.getTime()) - rng.int(6, 48) * HOUR), updated_at: now }));
      }
      return;
    }
    if (a.plan.noAutoTask) return;

    // Tarea abierta según la etapa; algunos leads quedan sin seguimiento a propósito (alerta)
    const lastEvent = a.times[a.times.length - 1];
    const noTaskP = idx === 0 ? 0.1 : idx <= 2 ? 0.2 : 0.12;
    if (rng.chance(noTaskP)) return;

    const plans: Array<{ kind: string; label?: string }> = [
      { kind: "call" },
      { kind: a.respondedLead ? "send_properties" : "whatsapp" },
      { kind: "send_properties" },
      { kind: "send_properties", label: `Coordinar visita con ${nm}` },
      { kind: "visit" },
      { kind: "follow_up", label: `Seguimiento post visita con ${nm}` },
      { kind: "follow_up", label: `Seguimiento de negociación — ${nm}` },
      { kind: "document", label: `Gestionar documentos de ${a.property?.code ?? "la reserva"} con ${nm}` },
    ];
    const spec = plans[Math.min(idx, 7)];
    let due: Date;
    const roll = rng.next();
    if (idx === 4 && a.futureVisitAt) {
      due = new Date(Math.max(now.getTime() + 20 * MIN, a.futureVisitAt.getTime() - rng.int(20, 30) * HOUR));
    } else if (a.unresolvedVisit) {
      due = clock.at(0, rng.int(10, 18), rng.pick([0, 15, 30]));
      spec.label = `Registrar resultado de la visita con ${nm}`;
    } else if (roll < 0.15) {
      // vencida
      const back = rng.int(1, 6);
      due = clock.at(-back, rng.int(9, 18), rng.pick([0, 30]));
      if (due.getTime() < lastEvent.getTime()) due = new Date(lastEvent.getTime() + rng.int(2, 20) * HOUR);
      if (due.getTime() >= now.getTime()) due = new Date(now.getTime() - rng.int(2, 20) * HOUR);
    } else if (roll < 0.4) {
      due = clock.at(0, rng.int(9, 19), rng.pick([0, 15, 30, 45]));
    } else if (roll < 0.62) {
      due = clock.at(1, rng.int(9, 18), rng.pick([0, 30]));
    } else {
      due = clock.at(rng.int(2, 7), rng.int(9, 18), rng.pick([0, 30]));
    }
    const created = new Date(Math.max(lastEvent.getTime(), Math.min(now.getTime() - HOUR, due.getTime() - 24 * HOUR)));
    out.tasks.push(mkTask({ ...base, title: spec.label ?? title(spec.kind), kind: spec.kind, due_at: due, status: rng.chance(0.08) ? "in_progress" : "pending", created_at: created, updated_at: created }));
  }
}

export function directClient(c: SimContext, args: { advisor: Advisor; name?: string; at: Date; profile?: Row; tags?: string[]; source?: string; phone?: string }): { clientId: string; name: string } {
  const { rng, out } = c;
  const person = args.name ? { fullName: args.name } : randomPerson(rng);
  const dist = rng.sample(DISTRICTS.map((d) => d.key), rng.int(1, 3));
  const op = rng.weighted([["buy", 60], ["rent", 32], ["invest", 8]] as const);
  const d0 = districtByKey(dist[0]);
  const area = rng.int(60, 150);
  const bud = op === "rent" ? round(area * d0.ppm * 0.0046, 100) : round(area * d0.ppm, 10000);
  const id = uuid();
  out.clients.push(
    mkClient({
      id,
      full_name: person.fullName,
      doc_type: "dni",
      doc_number: dniFor(rng),
      phone: args.phone ?? phoneFor(rng, c.phones),
      email: emailFor(rng, person.fullName),
      address: `${d0.streets[0]} ${rng.int(100, 2500)}, ${d0.label}`,
      source: args.source ?? rng.pick(["referral", "walk_in", "phone", "web"]),
      assigned_to: args.advisor.id,
      operation_type: op,
      property_type: rng.weighted([["apartment", 65], ["house", 25], ["office", 10]] as const),
      budget_min: round(bud * 0.85, op === "rent" ? 100 : 10000),
      budget_max: round(bud * 1.1, op === "rent" ? 100 : 10000),
      currency: "PEN",
      districts: dist,
      bedrooms_min: rng.int(1, 4),
      bathrooms_min: rng.chance(0.4) ? 2 : null,
      area_min: Math.floor((area * 0.85) / 5) * 5,
      area_max: rng.chance(0.4) ? Math.ceil((area * 1.4) / 10) * 10 : null,
      financing: op === "rent" ? null : rng.weighted([["cash", 20], ["mortgage", 55], ["undecided", 25]] as const),
      purchase_date: new Date(args.at.getTime() + rng.int(30, 200) * DAY).toISOString().slice(0, 10),
      created_by: args.advisor.id,
      created_at: args.at,
      updated_at: args.at,
      ...(args.profile ?? {}),
    }),
  );
  out.activities.push(mkActivity({ type: "system", event: "client_created", title: eventTitle("client_created"), client_id: id, user_id: args.advisor.id, occurred_at: args.at, created_at: args.at }));
  for (const t of args.tags ?? []) if (c.tagIds[t]) out.clientTags.push({ client_id: id, tag_id: c.tagIds[t] });
  return { clientId: id, name: person.fullName };
}

export { LEAD_STAGES, strip };
