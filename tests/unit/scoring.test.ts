import { describe, expect, it } from "vitest";
import { scoreLead, temperatureFor, type ScoreInput } from "@/lib/domain/scoring";

const NOW = new Date("2026-10-06T15:00:00Z");
const base: ScoreInput = {
  stage: "new",
  budgetMin: null,
  budgetMax: null,
  financing: null,
  interestLevel: null,
  purchaseDate: null,
  hasPropertyInterest: false,
  hasSpecificSearch: false,
  responded: false,
  lastRespondedAt: null,
  lastActivityAt: "2026-10-06T14:00:00Z",
  hasScheduledVisit: false,
  hasCompletedVisit: false,
  bestVisitOutcome: null,
  createdAt: "2026-10-06T14:00:00Z",
};

describe("temperatura del lead", () => {
  it.each([
    [0, "cold"],
    [30, "cold"],
    [31, "warm"],
    [60, "warm"],
    [61, "hot"],
    [80, "hot"],
    [81, "very_hot"],
    [100, "very_hot"],
  ])("puntaje %i → %s", (score, expected) => {
    expect(temperatureFor(score)).toBe(expected);
  });
});

describe("scoreLead", () => {
  it("un lead recién llegado y sin datos es frío", () => {
    const r = scoreLead(base, NOW);
    expect(r.score).toBeLessThanOrEqual(15);
    expect(r.temperature).toBe("cold");
  });

  it("suma capacidad de compra e intención", () => {
    const cold = scoreLead(base, NOW).score;
    const warm = scoreLead({ ...base, budgetMin: 300_000, budgetMax: 450_000, financing: "mortgage", hasPropertyInterest: true, hasSpecificSearch: true, interestLevel: "high" }, NOW);
    expect(warm.score).toBeGreaterThan(cold + 30);
    expect(warm.factors.find((f) => f.key === "budget")?.points).toBe(15);
  });

  it("un lead que visitó y quedó muy interesado es caliente", () => {
    const r = scoreLead(
      { ...base, stage: "negotiation", budgetMin: 400_000, budgetMax: 500_000, financing: "cash", hasPropertyInterest: true, hasSpecificSearch: true, interestLevel: "urgent", responded: true, lastRespondedAt: "2026-10-05T12:00:00Z", hasScheduledVisit: true, hasCompletedVisit: true, bestVisitOutcome: "very_interested" },
      NOW,
    );
    expect(r.score).toBeGreaterThan(80);
    expect(r.temperature).toBe("very_hot");
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("una visita sin interés resta puntos", () => {
    const interested = scoreLead({ ...base, hasCompletedVisit: true, hasScheduledVisit: true, bestVisitOutcome: "interested" }, NOW).score;
    const notInterested = scoreLead({ ...base, hasCompletedVisit: true, hasScheduledVisit: true, bestVisitOutcome: "not_interested" }, NOW).score;
    expect(notInterested).toBeLessThan(interested);
  });

  it("penaliza el enfriamiento por inactividad", () => {
    const active = scoreLead({ ...base, responded: true, lastRespondedAt: "2026-10-05T10:00:00Z" }, NOW).score;
    const idle = scoreLead({ ...base, responded: true, lastRespondedAt: "2026-08-01T10:00:00Z", lastActivityAt: "2026-08-01T10:00:00Z", createdAt: "2026-07-20T10:00:00Z" }, NOW).score;
    expect(idle).toBeLessThan(active);
  });

  it("un lead perdido nunca supera 15 puntos", () => {
    const r = scoreLead({ ...base, stage: "lost", budgetMin: 1, budgetMax: 2, financing: "cash", hasPropertyInterest: true, interestLevel: "urgent", responded: true, lastRespondedAt: "2026-10-06T10:00:00Z" }, NOW);
    expect(r.score).toBeLessThanOrEqual(15);
  });

  it("el puntaje siempre está entre 0 y 100", () => {
    for (const stage of ["new", "contacted", "qualified", "visit", "negotiation", "won", "lost"]) {
      const r = scoreLead({ ...base, stage }, NOW);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});
