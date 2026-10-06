import { describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/auth/password";
import { withUser, withAdmin } from "@/lib/db";
import { findDuplicates, createLead, assignLeads, getLead, listLeads } from "@/lib/services/leads";
import { createClient } from "@/lib/services/clients";
import { getDashboard } from "@/lib/services/dashboard";
import { createOpportunity, getOpportunity, moveOpportunity, winOpportunity } from "@/lib/services/opportunities";
import { createOwner } from "@/lib/services/owners";
import { createProperty, changePropertyState } from "@/lib/services/properties";
import { matchForClient, matchForLead } from "@/lib/services/matching";
import { createUserAccount } from "@/lib/services/users";
import { completeVisit, createVisit } from "@/lib/services/visits";
import { resolvePeriod } from "@/lib/domain/dates";
import { leadListQuerySchema } from "@/lib/validation/leads";
import { actorByRole, admin, count, futureLocal, labels, makeActor } from "./helpers";
import type { LeadInput } from "@/lib/validation/leads";
import type { ClientInput } from "@/lib/validation/clients";
import type { OwnerInput } from "@/lib/validation/clients";
import type { PropertyInput } from "@/lib/validation/properties";

const leadInput = (over: Partial<LeadInput> = {}): LeadInput => ({
  fullName: "Prueba Integración",
  phone: "",
  email: "",
  source: "whatsapp",
  priority: "medium",
  assignedTo: "",
  propertyId: "",
  message: "",
  interestLevel: "",
  purchaseDate: "",
  tagIds: [],
  operationType: "buy",
  propertyType: "",
  budgetMin: null,
  budgetMax: null,
  currency: "PEN",
  districts: [],
  bedroomsMin: null,
  bathroomsMin: null,
  areaMin: null,
  areaMax: null,
  financing: "",
  ...over,
});

async function freeSaleProperty(): Promise<{ id: string; code: string; price: number; currency: "PEN" | "USD"; district: string; property_type: string }> {
  const p = await admin((db) =>
    db.one<{ id: string; code: string; price: number; currency: "PEN" | "USD"; district: string; property_type: string }>(
      `select p.id, p.code, p.price, p.currency, p.district, p.property_type from public.properties p
        where p.status = 'available' and p.operation = 'sale'
          and not exists (select 1 from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open' where o.property_id = p.id)
          and not exists (select 1 from public.visits v where v.property_id = p.id and v.status in ('scheduled','confirmed'))
        order by p.code limit 1`,
    ),
  );
  if (!p) throw new Error("No hay propiedades libres para la prueba");
  return p;
}

describe("Flujo 1 · lead → oportunidad → visita → cierre", () => {
  it("recorre el negocio completo y deja todo conectado", async () => {
    const advisor = await actorByRole("advisor", 2);
    const prop = await freeSaleProperty();
    const phone = "955123401";

    // 1. Entra un lead (queda a nombre del asesor que lo registra)
    const { id: leadId } = await advisor.run((db) => createLead(db, advisor.session, leadInput({ fullName: "Carlos Prueba Flujo", phone, propertyId: prop.id, message: "Quiero ver el departamento", budgetMin: 400_000, budgetMax: 500_000, financing: "mortgage" }), "check", labels));
    const lead = await advisor.run((db) => getLead(db, leadId));
    expect(lead?.assigned_to).toBe(advisor.session.id);
    expect(lead?.stage).toBe("new");

    // Un segundo registro con el mismo teléfono se detecta como duplicado
    await expect(advisor.run((db) => createLead(db, advisor.session, leadInput({ fullName: "Carlos P.", phone }), "check", labels))).rejects.toMatchObject({ code: "duplicate" });

    // 2. Se crea la oportunidad: el lead avanza de etapa
    const { id: oppId } = await advisor.run((db) =>
      createOpportunity(db, advisor.session, { leadId, clientId: "", propertyId: prop.id, assignedTo: advisor.session.id, stage: "interested", value: prop.price, currency: prop.currency, probability: 25, priority: "high", expectedCloseDate: "", nextStep: "Agendar visita" }),
    );
    expect((await advisor.run((db) => getLead(db, leadId)))?.stage).toBe("opportunity");

    // 3. Se agenda una visita; la oportunidad y el lead avanzan
    const { id: visitId } = await advisor.run((db) =>
      createVisit(db, advisor.session, { leadId, clientId: "", propertyId: prop.id, opportunityId: oppId, advisorId: advisor.session.id, scheduledAt: futureLocal(3, 11), durationMin: 45, observations: "" }),
    );
    expect(await admin((db) => count(db, "select count(*) from public.visits where id = $1 and status = 'scheduled'", [visitId]))).toBe(1);

    // No se puede marcar como realizada sin resultado (regla de base de datos)
    await expect(admin((db) => db.query("update public.visits set status = 'completed' where id = $1", [visitId]))).rejects.toThrow();

    // 4. Se registra el resultado: el lead sube de puntaje
    const before = (await advisor.run((db) => getLead(db, leadId)))!.score;
    await advisor.run((db) => completeVisit(db, advisor.session, { id: visitId, outcome: "very_interested", notes: "Le encantó la distribución y la luz", followUp: false, followUpAt: "" }));
    const after = await advisor.run((db) => getLead(db, leadId));
    expect(after!.score).toBeGreaterThan(before);

    // 5. Negociación y cierre ganado
    await advisor.run((db) => moveOpportunity(db, advisor.session, oppId, "negotiation"));
    expect((await advisor.run((db) => getOpportunity(db, oppId)))?.probability).toBe(75);
    await advisor.run((db) => winOpportunity(db, advisor.session, oppId, 480_000, "Cierre con crédito hipotecario"));

    const won = await advisor.run((db) => getOpportunity(db, oppId));
    expect(won?.stage).toBe("won");
    expect(won?.probability).toBe(100);
    expect(won?.won_at).toBeTruthy();
    expect(won?.value).toBe(480_000);

    // El lead se convirtió en cliente y la propiedad quedó vendida
    const finalLead = await advisor.run((db) => getLead(db, leadId));
    expect(finalLead?.stage).toBe("won");
    expect(finalLead?.client_id).toBeTruthy();
    expect(await admin((db) => db.scalar<string>("select status from public.properties where id = $1", [prop.id]))).toBe("sold");

    // Trazabilidad: historial de etapas, actividades y auditoría
    expect(await admin((db) => count(db, "select count(*) from public.stage_history where entity_type = 'opportunity' and entity_id = $1", [oppId]))).toBeGreaterThanOrEqual(3);
    expect(await admin((db) => count(db, "select count(*) from public.activities where lead_id = $1", [leadId]))).toBeGreaterThanOrEqual(4);
    expect(await admin((db) => count(db, "select count(*) from public.audit_logs where entity_id = $1 and event in ('stage_change', 'update', 'create')", [oppId]))).toBeGreaterThanOrEqual(2);

    // Sin otra oportunidad abierta sobre la misma propiedad
    expect(await admin((db) => count(db, "select count(*) from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open' where o.property_id = $1", [prop.id]))).toBe(0);
  });
});

describe("Flujo 2 · cliente → preferencias → matching → visita", () => {
  it("encuentra propiedades compatibles con porcentaje y razones, y agenda una visita", async () => {
    const manager = await actorByRole("manager");
    const advisor = await actorByRole("advisor", 3);
    const target = await freeSaleProperty();

    const client: ClientInput = {
      fullName: "Elena Vargas Prueba",
      docType: "dni",
      docNumber: "45678912",
      phone: "955123402",
      email: "elena.prueba@example.com",
      address: "",
      source: "referral",
      assignedTo: advisor.session.id,
      searchNotes: "Familia de 4 personas",
      purchaseDate: "",
      tagIds: [],
      operationType: "buy",
      propertyType: target.property_type,
      budgetMin: Math.round(target.price * (target.currency === "PEN" ? 0.8 : 0.8)),
      budgetMax: Math.round(target.price * 1.15),
      currency: target.currency,
      districts: [target.district],
      bedroomsMin: null,
      bathroomsMin: null,
      areaMin: null,
      areaMax: null,
      financing: "mortgage",
    };
    const { id: clientId } = await manager.run((db) => createClient(db, manager.session, client, "check"));

    const { matches, profileEmpty } = await advisor.run((db) => matchForClient(db, clientId, 10));
    expect(profileEmpty).toBe(false);
    expect(matches.length).toBeGreaterThan(0);
    const top = matches.find((m) => m.id === target.id) ?? matches[0];
    expect(top.score).toBeGreaterThan(60);
    expect(top.reasons.length).toBeGreaterThan(2);
    expect(top.reasons.some((r) => r.key === "budget")).toBe(true);
    // Ordenadas de mayor a menor compatibilidad
    for (let i = 1; i < matches.length; i++) expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);

    const { id: visitId } = await advisor.run((db) =>
      createVisit(db, advisor.session, { leadId: "", clientId, propertyId: top.id, opportunityId: "", advisorId: advisor.session.id, scheduledAt: futureLocal(5, 16), durationMin: 60, observations: "Primera visita" }),
    );
    expect(visitId).toBeTruthy();
    const visit = await advisor.run((db) => db.one<{ client_id: string; status: string }>("select client_id, status from public.visits where id = $1", [visitId]));
    expect(visit).toMatchObject({ client_id: clientId, status: "scheduled" });
  });

  it("un lead con búsqueda definida también obtiene coincidencias", async () => {
    const advisor = await actorByRole("advisor", 0);
    const p = await freeSaleProperty();
    const { id } = await advisor.run((db) => createLead(db, advisor.session, leadInput({ fullName: "Lead con búsqueda", phone: "955123403", propertyType: p.property_type, districts: [p.district], budgetMin: p.price * 0.9, budgetMax: p.price * 1.1, currency: p.currency }), "create", labels));
    const { matches } = await advisor.run((db) => matchForLead(db, id, 5));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].score).toBeGreaterThan(50);
  });
});

describe("Flujo 3 · propietario → propiedad → publicar → lead → asignar", () => {
  it("registra el inventario, recibe un lead y lo asigna a un vendedor", async () => {
    const manager = await actorByRole("manager");
    const advisor = await actorByRole("advisor", 1);

    const owner: OwnerInput = { fullName: "Teodoro Quispe Prueba", docType: "dni", docNumber: "40123456", phone: "955123404", email: "", address: "", ownerType: "individual", notes: "" };
    const { id: ownerId } = await manager.run((db) => createOwner(db, manager.session, owner));

    const input: PropertyInput = {
      code: "",
      title: "Departamento de prueba en Jesús María",
      description: "Luminoso, cerca al parque Campo de Marte",
      propertyType: "apartment",
      operation: "sale",
      price: 395_000,
      currency: "PEN",
      minPrice: 380_000,
      commissionPct: 3,
      district: "jesus_maria",
      province: "Lima",
      address: "Av. Salaverry 2200",
      reference: "",
      latitude: null,
      longitude: null,
      totalArea: 85,
      builtArea: 80,
      bedrooms: 3,
      bathrooms: 2,
      parking: 1,
      ageYears: 5,
      floor: 4,
      elevator: true,
      furnished: false,
      features: ["elevator"],
      status: "available",
      publicationStatus: "pending",
      ownerId,
      advisorId: advisor.session.id,
    };
    const { id: propertyId, code } = await advisor.run((db) => createProperty(db, advisor.session, input));
    expect(code).toMatch(/^JM-\d+/);

    await advisor.run((db) => changePropertyState(db, advisor.session, propertyId, { publicationStatus: "published" }));
    const row = await admin((db) => db.one<{ publication_status: string; published_at: string | null }>("select publication_status, published_at from public.properties where id = $1", [propertyId]));
    expect(row?.publication_status).toBe("published");
    expect(row?.published_at).toBeTruthy();

    // Llega un lead consultando por la propiedad; la asistente lo registra sin asignar
    const assistant = await actorByRole("assistant");
    const { id: leadId } = await assistant.run((db) => createLead(db, assistant.session, leadInput({ fullName: "Consulta Portal", phone: "955123405", propertyId, source: "web", message: "¿Sigue disponible?" }), "create", labels));
    expect((await assistant.run((db) => getLead(db, leadId)))?.assigned_to).toBeNull();

    // El gerente lo asigna al asesor de la propiedad y este recibe la notificación
    await manager.run((db) => assignLeads(db, manager.session, [leadId], advisor.session.id, true));
    const assigned = await advisor.run((db) => getLead(db, leadId));
    expect(assigned?.assigned_to).toBe(advisor.session.id);
    expect(await advisor.run((db) => count(db, "select count(*) from public.notifications where type = 'lead_assigned' and href = $1", [`/leads/${leadId}`]))).toBe(1);

    // Cambió el precio: queda en el historial
    await advisor.run((db) => db.query("update public.properties set price = 385000 where id = $1", [propertyId]));
    expect(await admin((db) => count(db, "select count(*) from public.property_price_history where property_id = $1", [propertyId]))).toBeGreaterThanOrEqual(1);
  });
});

describe("Flujo 4 · crear asesor → iniciar sesión → dashboard → gestionar leads", () => {
  it("el nuevo asesor puede entrar y trabajar solo con lo suyo", async () => {
    const adm = await actorByRole("admin");
    const email = "nuevo.asesor.prueba@altura.example";
    const { id } = await withAdmin((db) => createUserAccount(db, { fullName: "Nuevo Asesor Prueba", email, phone: "955000111", role: "advisor", password: "Prueba2026" }));
    expect(id).toBeTruthy();

    // Autenticación (modo demo): la contraseña se guarda con hash y se verifica
    const auth = await admin((db) => db.one<{ encrypted_password: string }>("select encrypted_password from auth.users where lower(email) = $1", [email]));
    expect(auth!.encrypted_password).not.toContain("Prueba2026");
    expect(verifyPassword("Prueba2026", auth!.encrypted_password)).toBe(true);
    expect(verifyPassword("otra-clave", auth!.encrypted_password)).toBe(false);

    // Un correo repetido se rechaza con un mensaje claro
    await expect(withAdmin((db) => createUserAccount(db, { fullName: "Otro", email, phone: "", role: "advisor", password: "Prueba2026" }))).rejects.toThrow(/ya existe/i);

    const me = makeActor({ id, email, fullName: "Nuevo Asesor Prueba", role: "advisor", avatarUrl: null, phone: null });

    // Dashboard personal: vacío pero válido
    const period = resolvePeriod("30d");
    const dash = await me.run((db) => getDashboard(db, { period, ownerId: id, viewerId: id, currency: "PEN", usdRate: 3.75 }));
    expect(dash.kpis.newLeads.value).toBe(0);
    expect(dash.kpis.openOpportunities.count).toBe(0);

    // Gestiona leads: crea uno (queda a su nombre), lo ve en su lista y no ve los de otros
    const { id: leadId } = await me.run((db) => createLead(db, me.session, leadInput({ fullName: "Lead del nuevo asesor", phone: "955123406" }), "create", labels));
    const list = await me.run((db) => listLeads(db, leadListQuerySchema.parse({ pageSize: "100" })));
    expect(list.rows.some((r) => r.id === leadId)).toBe(true);
    expect(list.rows.every((r) => r.assigned_to === id || r.assigned_to === null)).toBe(true);

    // El administrador desactiva al usuario: deja de existir como sesión válida
    await withAdmin((db) => db.query("update public.users set status = 'inactive' where id = $1", [id]));
    expect(await admin((db) => count(db, "select count(*) from public.users where id = $1 and status = 'active'", [id]))).toBe(0);
    void adm;
  });
});

describe("Duplicados", () => {
  it("detecta contactos repetidos por teléfono con distintos formatos y por correo", async () => {
    const row = await admin((db) => db.one<{ phone: string; email: string | null }>("select phone, email from public.leads where phone is not null limit 1"));
    const digits = row!.phone.replace(/\D/g, "").slice(-9);
    const spaced = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    const staff = await actorByRole("manager");
    const dups = await staff.run((db) => findDuplicates(db, { phone: spaced }));
    expect(dups.length).toBeGreaterThan(0);
    expect(dups[0].phone_match).toBe(true);
    expect(await staff.run((db) => findDuplicates(db, { phone: "000", email: "" }))).toHaveLength(0);
    // La función solo responde a personal autenticado (no expone datos sin sesión)
    expect(await admin((db) => findDuplicates(db, { phone: spaced }))).toHaveLength(0);
  });
});

void withUser;

describe("Cierre con competencia sobre la misma propiedad", () => {
  it("al ganar un vendedor, las oportunidades abiertas de otros se cierran aunque no puedan verse entre sí", async () => {
    const a = await actorByRole("advisor", 0);
    const b = await actorByRole("advisor", 1);
    const prop = await freeSaleProperty();

    const mk = async (actor: typeof a, name: string, phone: string) => {
      const { id: leadId } = await actor.run((db) => createLead(db, actor.session, leadInput({ fullName: name, phone, propertyId: prop.id }), "create", labels));
      const { id } = await actor.run((db) => createOpportunity(db, actor.session, { leadId, clientId: "", propertyId: prop.id, assignedTo: actor.session.id, stage: "negotiation", value: prop.price, currency: prop.currency, probability: 75, priority: "medium", expectedCloseDate: "", nextStep: "" }));
      return id;
    };
    const oppA = await mk(a, "Comprador A", "955123501");
    const oppB = await mk(b, "Comprador B", "955123502");

    // Cada asesor solo ve su propia oportunidad
    expect(await a.run((db) => count(db, "select count(*) from public.opportunities where id = $1", [oppB]))).toBe(0);

    await a.run((db) => winOpportunity(db, a.session, oppA, prop.price, null));

    const lost = await admin((db) => db.one<{ stage: string; lost_reason: string }>("select stage, lost_reason from public.opportunities where id = $1", [oppB]));
    expect(lost).toMatchObject({ stage: "lost", lost_reason: "other_property" });
    expect(await admin((db) => db.scalar<string>("select status from public.properties where id = $1", [prop.id]))).toBe("sold");
  });
});
