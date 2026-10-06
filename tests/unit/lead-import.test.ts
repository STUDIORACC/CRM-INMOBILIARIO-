import { describe, expect, it } from "vitest";
import { dedupeKeys, guessMapping, normalizeImportRow, parseAmount, type ImportContext } from "@/lib/domain/lead-import";
import { normalizePhone } from "@/lib/domain/phone";

const ctx: ImportContext = {
  sources: [
    { key: "whatsapp", label: "WhatsApp" },
    { key: "facebook", label: "Facebook" },
    { key: "referral", label: "Referidos" },
    { key: "website", label: "Sitio web" },
  ],
  propertyTypes: [
    { key: "apartment", label: "Departamento" },
    { key: "house", label: "Casa" },
  ],
  districts: [
    { key: "san_miguel", label: "San Miguel" },
    { key: "jesus_maria", label: "Jesús María" },
    { key: "miraflores", label: "Miraflores" },
  ],
  users: [
    { id: "11111111-1111-4111-8111-111111111111", fullName: "José López", email: "jose.lopez@altura.example" },
    { id: "22222222-2222-4222-8222-222222222222", fullName: "María Fernanda Rojas", email: "mafe.rojas@altura.example" },
  ],
  defaultSource: "website",
  defaultAssignee: "",
};

describe("auto-mapeo de columnas", () => {
  it("reconoce encabezados habituales en español", () => {
    const m = guessMapping(["Nombre", "Celular", "Correo", "Origen", "Comentario", "Operación", "Distrito", "Presupuesto", "Asesor"]);
    expect(m).toMatchObject({ fullName: "Nombre", phone: "Celular", email: "Correo", source: "Origen", message: "Comentario", operationType: "Operación", districts: "Distrito", budgetMax: "Presupuesto", assignedTo: "Asesor" });
  });
  it("no asigna una misma columna a dos campos", () => {
    const m = guessMapping(["Presupuesto"]);
    expect(m.budgetMax).toBe("Presupuesto");
    expect(m.budgetMin).toBeUndefined();
  });
  it("ignora tildes y mayúsculas", () => {
    expect(guessMapping(["TELÉFONO", "E-MAIL"])).toMatchObject({ phone: "TELÉFONO", email: "E-MAIL" });
  });
});

describe("montos", () => {
  it.each([
    ["S/ 450,000", 450_000, "PEN"],
    ["450000", 450_000, null],
    ["US$ 200 mil", 200_000, "USD"],
    ["$ 1.2 M", 1_200_000, "USD"],
    ["380 000", 380_000, null],
    ["450k", 450_000, null],
    ["", null, null],
    ["a convenir", null, null],
  ])("«%s» → %s %s", (raw, value, currency) => {
    const r = parseAmount(raw);
    expect(r.value).toBe(value);
    expect(r.currency).toBe(currency);
  });
});

describe("normalización de filas", () => {
  it("convierte una fila completa en un lead válido", () => {
    const r = normalizeImportRow({ fullName: "Rosa Campos", phone: "987 111 222", email: "ROSA@Gmail.com", source: "facebook", operationType: "Compra", districts: "San Miguel, Jesús María", propertyType: "depa", budgetMax: "S/ 380 000", assignedTo: "jose lopez", priority: "alta" }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.input).toMatchObject({ fullName: "Rosa Campos", email: "rosa@gmail.com", source: "facebook", operationType: "buy", districts: ["san_miguel", "jesus_maria"], budgetMax: 380_000, currency: "PEN", assignedTo: "11111111-1111-4111-8111-111111111111", priority: "high" });
  });
  it("exige nombre y un medio de contacto", () => {
    const r = normalizeImportRow({ fullName: "Sin contacto" }, ctx);
    expect(r.input).toBeNull();
    expect(r.errors.join(" ")).toMatch(/teléfono o un correo/i);
    expect(normalizeImportRow({ phone: "987654321" }, ctx).input).toBeNull();
  });
  it("rechaza teléfonos y correos inválidos", () => {
    expect(normalizeImportRow({ fullName: "Ana Ruiz", phone: "123" }, ctx).input).toBeNull();
    expect(normalizeImportRow({ fullName: "Ana Ruiz", email: "no-es-correo" }, ctx).input).toBeNull();
  });
  it("usa valores por defecto y avisa cuando no reconoce un dato", () => {
    const r = normalizeImportRow({ fullName: "Marta Ríos", phone: "912000111", source: "tiktok", assignedTo: "Asesor Fantasma", districts: "Narnia" }, ctx);
    expect(r.input?.source).toBe("website");
    expect(r.input?.assignedTo).toBe("");
    expect(r.warnings.length).toBe(3);
  });
  it("detecta dólares y ordena un rango invertido", () => {
    const r = normalizeImportRow({ fullName: "Luis Vega", phone: "955444333", budgetMin: "US$ 200 mil", budgetMax: "US$ 150 mil" }, ctx);
    expect(r.input).toMatchObject({ currency: "USD", budgetMin: 150_000, budgetMax: 200_000 });
  });
});

describe("claves de duplicado dentro del archivo", () => {
  it("usa teléfono normalizado y correo en minúsculas", () => {
    const keys = dedupeKeys({ phone: "987 654 321", email: "A@B.pe" }, normalizePhone);
    expect(keys).toEqual(["p:51987654321", "e:a@b.pe"]);
  });
});
