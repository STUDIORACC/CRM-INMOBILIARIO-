import { describe, expect, it } from "vitest";
import { describeChanges, formatAuditValue, type AuditCtx } from "@/lib/domain/audit";
import { addDaysIso, fromInputDateTime, isPeriodKey, resolvePeriod, toInputDateTime } from "@/lib/domain/dates";
import { formatMoney, formatMoneyCompact, formatPercent, toBaseCurrency } from "@/lib/domain/money";
import { fillTemplate } from "@/lib/domain/templates";

describe("plantillas de mensajes", () => {
  it("reemplaza variables y elimina las que no tienen valor", () => {
    expect(fillTemplate("Hola {{nombre}}, te escribe {{asesor}} de {{empresa}}.{{fecha}}", { nombre: "Carlos", asesor: "José", empresa: "Altura" })).toBe("Hola Carlos, te escribe José de Altura.");
  });
  it("no deja marcadores literales", () => {
    expect(fillTemplate("Visita el {{fecha}} a las {{hora}}", { fecha: "viernes" })).not.toContain("{{");
  });
});

describe("dinero", () => {
  it("formatea soles y dólares", () => {
    expect(formatMoney(480_000, "PEN")).toBe("S/ 480,000");
    expect(formatMoney(200_000, "USD")).toBe("US$ 200,000");
    expect(formatMoney(null)).toBe("—");
  });
  it("formato compacto", () => {
    expect(formatMoneyCompact(3_450_000)).toBe("S/ 3.45 M");
    expect(formatMoneyCompact(480_000)).toBe("S/ 480 K");
    expect(formatMoneyCompact(5_000)).toBe("S/ 5,000");
  });
  it("convierte con el tipo de cambio", () => {
    expect(toBaseCurrency(100, "USD", "PEN", 3.75)).toBe(375);
    expect(toBaseCurrency(375, "PEN", "USD", 3.75)).toBe(100);
    expect(toBaseCurrency(50, "PEN", "PEN", 3.75)).toBe(50);
  });
  it("porcentajes", () => {
    expect(formatPercent(11.234)).toBe("11.2%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("fechas y periodos (America/Lima)", () => {
  it("convierte entre datetime-local y ISO usando la zona de la empresa", () => {
    // Lima es UTC-5 todo el año
    expect(fromInputDateTime("2026-10-06T16:30")).toBe("2026-10-06T21:30:00.000Z");
    expect(toInputDateTime("2026-10-06T21:30:00.000Z")).toBe("2026-10-06T16:30");
    expect(fromInputDateTime("basura")).toBeNull();
  });
  it("resuelve periodos con comparativo del mismo largo", () => {
    const now = new Date("2026-10-15T15:00:00Z");
    const p = resolvePeriod("30d", {}, now);
    expect(p.days).toBe(30);
    expect(new Date(p.toIso).getTime() - new Date(p.fromIso).getTime()).toBe(30 * 86_400_000);
    expect(p.prevToIso).toBe(p.fromIso);
    const month = resolvePeriod("month", {}, now);
    expect(month.fromDate).toBe("2026-10-01");
    const last = resolvePeriod("last_month", {}, now);
    expect(last.fromDate).toBe("2026-09-01");
    expect(last.toDate).toBe("2026-09-30");
  });
  it("un rango personalizado inválido cae a 30 días", () => {
    expect(resolvePeriod("custom", { from: "2026-10-10", to: "2026-10-01" }).key).toBe("30d");
    expect(resolvePeriod("custom", { from: "2026-10-01", to: "2026-10-10" }).days).toBe(10);
  });
  it("valida claves de periodo y suma días", () => {
    expect(isPeriodKey("7d")).toBe(true);
    expect(isPeriodKey("ayer")).toBe(false);
    expect(addDaysIso("2026-10-06T00:00:00.000Z", 2)).toBe("2026-10-08T00:00:00.000Z");
  });
});

describe("auditoría legible", () => {
  const ctx: AuditCtx = { userName: (id) => (id === "u1" ? "José López" : "—"), stageLabel: (k) => `Etapa ${k}`, source: (k) => k ?? "—", district: (k) => k ?? "—", propertyType: (k) => k ?? "—", lossReason: (k) => k ?? "—" };
  it("traduce usuarios, etapas y montos", () => {
    expect(formatAuditValue("assigned_to", "11111111-1111-4111-8111-111111111111", "leads", ctx)).toBe("—");
    expect(formatAuditValue("stage", "negotiation", "opportunities", ctx)).toBe("Etapa negotiation");
    expect(formatAuditValue("price", 480000, "properties", ctx, "PEN")).toBe("S/ 480,000");
    expect(formatAuditValue("active", true, "catalog_items", ctx)).toBe("Sí");
    expect(formatAuditValue("phone", null, "leads", ctx)).toBe("—");
  });
  it("describe los cambios de una edición", () => {
    const lines = describeChanges({ stage: { from: "new", to: "contacted" }, priority: { from: "medium", to: "high" } }, "leads", ctx);
    expect(lines.map((l) => [l.label, l.from, l.to])).toEqual([
      ["Etapa", "Nuevo", "Contactado"],
      ["Prioridad", "Media", "Alta"],
    ]);
  });
});
