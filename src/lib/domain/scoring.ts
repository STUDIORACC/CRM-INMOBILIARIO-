import type { Financing, InterestLevel, Temperature, VisitOutcome } from "./constants";

/**
 * Lead scoring comercial (0–100).
 *
 * Mide qué tan cerca está un lead de comprar, no cuánta información hay cargada:
 *   Capacidad de compra   presupuesto definido (15) + financiamiento (12)
 *   Intención             propiedad de interés (8) + búsqueda concreta (5) + urgencia (10)
 *   Interacción           respondió mensajes (10) + respondió recientemente (8)
 *   Avance comercial      solicitó visita (12) + visitó (15) + resultado de la visita (±)
 *   Enfriamiento          penaliza leads sin actividad (hasta −20)
 * Un lead perdido nunca supera 15 puntos.
 */
export interface ScoreInput {
  stage: string;
  budgetMin: number | null;
  budgetMax: number | null;
  financing: Financing | null;
  interestLevel: InterestLevel | null;
  purchaseDate: string | null;
  hasPropertyInterest: boolean;
  hasSpecificSearch: boolean;
  /** Algún contacto donde el lead respondió (llamada contestada, mensaje entrante…). */
  responded: boolean;
  lastRespondedAt: string | null;
  lastActivityAt: string | null;
  hasScheduledVisit: boolean;
  hasCompletedVisit: boolean;
  bestVisitOutcome: VisitOutcome | null;
  createdAt: string;
}

export interface ScoreFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface ScoreResult {
  score: number;
  temperature: Temperature;
  factors: ScoreFactor[];
}

export function temperatureFor(score: number): Temperature {
  if (score <= 30) return "cold";
  if (score <= 60) return "warm";
  if (score <= 80) return "hot";
  return "very_hot";
}

const DAY = 86_400_000;

function daysBetween(from: string | null, now: Date): number | null {
  if (!from) return null;
  return Math.floor((now.getTime() - new Date(from).getTime()) / DAY);
}

export function scoreLead(input: ScoreInput, now: Date = new Date()): ScoreResult {
  const factors: ScoreFactor[] = [];
  const add = (key: string, label: string, points: number, max: number, detail: string) =>
    factors.push({ key, label, points, max, detail });

  // Presupuesto definido (15)
  const hasMax = input.budgetMax != null && input.budgetMax > 0;
  const hasMin = input.budgetMin != null && input.budgetMin > 0;
  const budgetPts = hasMax && hasMin ? 15 : hasMax || hasMin ? 10 : 0;
  add(
    "budget",
    "Presupuesto definido",
    budgetPts,
    15,
    budgetPts === 15 ? "Rango mínimo y máximo definido" : budgetPts ? "Solo un extremo del rango" : "Sin presupuesto",
  );

  // Capacidad de compra (12)
  const finPts = input.financing === "cash" ? 12 : input.financing === "mortgage" ? 8 : input.financing === "undecided" ? 3 : 0;
  add(
    "financing",
    "Capacidad de compra",
    finPts,
    12,
    input.financing === "cash"
      ? "Paga al contado"
      : input.financing === "mortgage"
        ? "Crédito hipotecario"
        : input.financing === "undecided"
          ? "Financiamiento por evaluar"
          : "Sin información de financiamiento",
  );

  // Propiedad de interés (8)
  add("property", "Propiedad de interés", input.hasPropertyInterest ? 8 : 0, 8, input.hasPropertyInterest ? "Consultó por una propiedad concreta" : "Sin propiedad identificada");

  // Búsqueda concreta (5)
  add("search", "Búsqueda concreta", input.hasSpecificSearch ? 5 : 0, 5, input.hasSpecificSearch ? "Tipo y zona definidos" : "Tipo o zona sin definir");

  // Urgencia (10)
  const levelPts: Record<string, number> = { urgent: 10, high: 7, medium: 4, low: 1 };
  let urgency = input.interestLevel ? (levelPts[input.interestLevel] ?? 0) : 0;
  let urgencyDetail = input.interestLevel ? `Interés ${input.interestLevel === "urgent" ? "urgente" : input.interestLevel === "high" ? "alto" : input.interestLevel === "medium" ? "medio" : "bajo"}` : "Sin nivel de interés";
  if (input.purchaseDate) {
    const daysToBuy = Math.ceil((new Date(input.purchaseDate).getTime() - now.getTime()) / DAY);
    const datePts = daysToBuy <= 30 ? 10 : daysToBuy <= 90 ? 7 : daysToBuy <= 180 ? 4 : 1;
    if (daysToBuy >= -30 && datePts > urgency) {
      urgency = datePts;
      urgencyDetail = daysToBuy <= 30 ? "Planea comprar en menos de 30 días" : daysToBuy <= 90 ? "Planea comprar en menos de 3 meses" : "Planea comprar en el semestre";
    }
  }
  add("urgency", "Urgencia", urgency, 10, urgencyDetail);

  // Respondió mensajes (10)
  add("responded", "Respondió mensajes", input.responded ? 10 : 0, 10, input.responded ? "Ha respondido al equipo" : "Aún no responde");

  // Respondió recientemente (8)
  const sinceReply = daysBetween(input.lastRespondedAt, now);
  const recentPts = sinceReply == null ? 0 : sinceReply <= 3 ? 8 : sinceReply <= 7 ? 5 : sinceReply <= 14 ? 2 : 0;
  add(
    "recent_reply",
    "Respondió recientemente",
    recentPts,
    8,
    sinceReply == null ? "Sin respuestas registradas" : sinceReply === 0 ? "Respondió hoy" : `Última respuesta hace ${sinceReply} d`,
  );

  // Solicitó visita (12)
  add("visit_requested", "Solicitó visita", input.hasScheduledVisit || input.hasCompletedVisit ? 12 : 0, 12, input.hasScheduledVisit || input.hasCompletedVisit ? "Tiene visita agendada o realizada" : "Sin visita solicitada");

  // Visitó (15) + resultado (±)
  const outcomeBonus: Record<VisitOutcome, number> = {
    very_interested: 5,
    interested: 3,
    needs_time: 1,
    wants_other: 0,
    not_interested: -10,
  };
  const visitPts = input.hasCompletedVisit ? Math.max(0, 15 + (input.bestVisitOutcome ? outcomeBonus[input.bestVisitOutcome] : 0)) : 0;
  add(
    "visited",
    "Visitó la propiedad",
    Math.min(20, visitPts),
    20,
    input.hasCompletedVisit
      ? input.bestVisitOutcome
        ? `Visita realizada · ${input.bestVisitOutcome === "very_interested" ? "muy interesado" : input.bestVisitOutcome === "interested" ? "interesado" : input.bestVisitOutcome === "needs_time" ? "necesita pensarlo" : input.bestVisitOutcome === "wants_other" ? "desea otra propiedad" : "no interesado"}`
        : "Visita realizada"
      : "Aún no visita",
  );

  // Enfriamiento
  const idle = daysBetween(input.lastActivityAt ?? input.createdAt, now) ?? 0;
  const coolPts = idle >= 30 ? -20 : idle >= 14 ? -10 : 0;
  if (coolPts !== 0) add("cooling", "Sin actividad reciente", coolPts, 0, `${idle} días sin contacto`);

  let score = factors.reduce((acc, f) => acc + f.points, 0);
  score = Math.max(0, Math.min(100, Math.round(score)));
  if (input.stage === "lost") score = Math.min(score, 15);

  return { score, temperature: temperatureFor(score), factors };
}
