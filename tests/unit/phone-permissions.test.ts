import { describe, expect, it } from "vitest";
import { can, isManagerRole } from "@/lib/domain/permissions";
import { formatPhone, mailtoLink, normalizePhone, telLink, whatsappLink } from "@/lib/domain/phone";

describe("teléfonos", () => {
  it("normaliza celulares peruanos con código de país", () => {
    expect(normalizePhone("987 654 321")).toBe("51987654321");
    expect(normalizePhone("+51 987-654-321")).toBe("51987654321");
    expect(normalizePhone("0051987654321")).toBe("51987654321");
  });
  it("devuelve null si no hay dígitos", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("sin teléfono")).toBeNull();
  });
  it("da formato legible", () => {
    expect(formatPhone("987654321")).toBe("+51 987 654 321");
  });
  it("arma enlaces de WhatsApp, llamada y correo", () => {
    expect(whatsappLink("987654321", "Hola Carlos")).toBe("https://wa.me/51987654321?text=Hola%20Carlos");
    expect(telLink("987654321")).toBe("tel:+51987654321");
    expect(mailtoLink("a@b.pe", "Visita", "Hola")).toBe("mailto:a@b.pe?subject=Visita&body=Hola");
    expect(whatsappLink(null)).toBeNull();
  });
});

describe("matriz de permisos", () => {
  it("el administrador puede todo", () => {
    for (const c of ["settings.manage", "audit.view", "team.view", "leads.delete", "owners.access", "leads.import"] as const) expect(can("admin", c)).toBe(true);
  });
  it("el gerente no cambia la configuración pero sí ve auditoría y equipo", () => {
    expect(can("manager", "settings.manage")).toBe(false);
    expect(can("manager", "audit.view")).toBe(true);
    expect(can("manager", "team.view")).toBe(true);
    expect(can("manager", "templates.manage")).toBe(true);
  });
  it("el asesor trabaja lo suyo: sin equipo, auditoría ni exportación de leads", () => {
    expect(can("advisor", "team.view")).toBe(false);
    expect(can("advisor", "audit.view")).toBe(false);
    expect(can("advisor", "leads.export")).toBe(false);
    expect(can("advisor", "opportunities.access")).toBe(true);
    expect(can("advisor", "reports.view")).toBe(true);
    expect(can("advisor", "reports.global")).toBe(false);
  });
  it("el asistente no accede a oportunidades ni propietarios, pero reparte e importa leads", () => {
    expect(can("assistant", "opportunities.access")).toBe(false);
    expect(can("assistant", "owners.access")).toBe(false);
    expect(can("assistant", "leads.assign_any")).toBe(true);
    expect(can("assistant", "leads.import")).toBe(true);
  });
  it("sin rol no hay permisos", () => {
    expect(can(null, "reports.view")).toBe(false);
    expect(can(undefined, "reports.view")).toBe(false);
  });
  it("identifica roles de gerencia", () => {
    expect(isManagerRole("admin")).toBe(true);
    expect(isManagerRole("manager")).toBe(true);
    expect(isManagerRole("advisor")).toBe(false);
  });
});
