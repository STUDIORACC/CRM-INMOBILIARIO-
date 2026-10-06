import { describe, expect, it } from "vitest";
import { matchProperty, profileIsEmpty, type MatchableProperty, type SearchProfile } from "@/lib/domain/matching";

const ctx = { usdRate: 3.75, districtLabel: (k: string) => k };
const profile: SearchProfile = { operationType: "buy", propertyType: "apartment", budgetMin: 400_000, budgetMax: 500_000, currency: "PEN", districts: ["san_miguel"], bedroomsMin: 3, bathroomsMin: 2, areaMin: 90, areaMax: 140 };
const property: MatchableProperty = { id: "p1", operation: "sale", propertyType: "apartment", price: 480_000, minPrice: null, currency: "PEN", district: "san_miguel", bedrooms: 3, bathrooms: 2, totalArea: 110, builtArea: 105 };

describe("matching búsqueda ↔ propiedad", () => {
  it("una propiedad que cumple todo da 100%", () => {
    const r = matchProperty(profile, property, ctx);
    expect(r.eligible).toBe(true);
    expect(r.score).toBe(100);
    expect(r.reasons.every((x) => x.status === "match")).toBe(true);
  });

  it("la operación es un filtro duro (compra vs alquiler)", () => {
    const r = matchProperty(profile, { ...property, operation: "rent" }, ctx);
    expect(r.eligible).toBe(false);
  });

  it("un distrito colindante da coincidencia parcial", () => {
    const exact = matchProperty(profile, property, ctx).score;
    const near = matchProperty(profile, { ...property, district: "magdalena" }, ctx);
    expect(near.score).toBeLessThan(exact);
    expect(near.reasons.find((r) => r.key === "district")?.status).toBe("partial");
  });

  it("un distrito lejano no coincide", () => {
    const far = matchProperty(profile, { ...property, district: "la_molina" }, ctx);
    expect(far.reasons.find((r) => r.key === "district")?.status).toBe("miss");
  });

  it("convierte dólares a soles para evaluar el presupuesto", () => {
    // US$ 128,000 × 3.75 = S/ 480,000 → dentro del rango
    const r = matchProperty(profile, { ...property, price: 128_000, currency: "USD" }, ctx);
    expect(r.reasons.find((x) => x.key === "budget")?.status).toBe("match");
  });

  it("un precio muy por encima del presupuesto penaliza", () => {
    const r = matchProperty(profile, { ...property, price: 900_000 }, ctx);
    expect(r.reasons.find((x) => x.key === "budget")?.status).toBe("miss");
    expect(r.score).toBeLessThan(80);
  });

  it("el precio mínimo negociable cuenta para el presupuesto", () => {
    const r = matchProperty(profile, { ...property, price: 520_000, minPrice: 495_000 }, ctx);
    expect(r.reasons.find((x) => x.key === "budget")?.status).not.toBe("miss");
  });

  it("los criterios no definidos no penalizan", () => {
    const loose: SearchProfile = { ...profile, districts: [], bedroomsMin: null, bathroomsMin: null, areaMin: null, areaMax: null, propertyType: null };
    const r = matchProperty(loose, property, ctx);
    expect(r.score).toBe(100);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it("detecta perfiles vacíos", () => {
    expect(profileIsEmpty({ operationType: null, propertyType: null, budgetMin: null, budgetMax: null, currency: "PEN", districts: [], bedroomsMin: null, bathroomsMin: null, areaMin: null, areaMax: null })).toBe(true);
    expect(profileIsEmpty(profile)).toBe(false);
  });
});
