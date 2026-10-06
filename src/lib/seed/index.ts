import { json, type Db } from "../db/types";
import { matchProperty, type MatchableProperty, type SearchProfile } from "../domain/matching";
import { eventTitle } from "../domain/events";
import { formatMoney } from "../domain/money";
import { notifKey } from "../domain/events";
import { recomputeLeadScores } from "../services/lead-score";
import { refreshDerivedFields } from "../services/maintenance";
import { syncAlertNotifications } from "../services/alerts";
import { Clock, bulkInsert, minimalPdf, mkActivity, mkTask, mkVisit, uuid, TEXT, type Row } from "./builders";
import { COMPANY_NAMES, dniFor, emailFor, phoneFor, randomPerson, rucFor } from "./names";
import { DISTRICTS, generateProperties } from "./properties";
import { DAY, HOUR, MIN, Rng } from "./rng";
import { Simulator, directClient, type Advisor, type SeedOutput, type SimContext } from "./simulate";

export interface SeedHooks {
  createAuthUser(db: Db, u: { email: string; password: string; fullName: string }): Promise<string>;
  putFile?(objectPath: string, bytes: Uint8Array, mime: string): Promise<void>;
}

export const DEMO_PASSWORD = "Demo2026!";

export const DEMO_USERS = [
  { key: "admin", name: "Patricia Villanueva", email: "patricia.villanueva@altura.example", role: "admin", hired: "2019-03-04", phone: "987 100 201" },
  { key: "manager", name: "Ricardo Paredes", email: "ricardo.paredes@altura.example", role: "manager", hired: "2020-01-13", phone: "987 100 202" },
  { key: "jose", name: "José López", email: "jose.lopez@altura.example", role: "advisor", hired: "2021-02-08", phone: "987 100 203", weight: 26, mult: 1.3 },
  { key: "mafe", name: "María Fernanda Rojas", email: "mafe.rojas@altura.example", role: "advisor", hired: "2021-08-23", phone: "987 100 204", weight: 22, mult: 1.15 },
  { key: "luis", name: "Luis Chávez", email: "luis.chavez@altura.example", role: "advisor", hired: "2022-05-16", phone: "987 100 205", weight: 20, mult: 0.9 },
  { key: "camila", name: "Camila Herrera", email: "camila.herrera@altura.example", role: "advisor", hired: "2023-03-06", phone: "987 100 206", weight: 18, mult: 1.0 },
  { key: "sofia", name: "Sofía Delgado", email: "sofia.delgado@altura.example", role: "advisor", hired: "2024-06-10", phone: "987 100 207", weight: 14, mult: 0.7 },
  { key: "assistant", name: "Daniela Quispe", email: "daniela.quispe@altura.example", role: "assistant", hired: "2023-09-18", phone: "987 100 208" },
] as const;

const SEED_TRIGGERS: Array<[string, string]> = [
  ...["leads", "clients", "owners", "properties", "opportunities", "visits", "tasks", "users", "company_settings", "catalog_items", "pipeline_stages"].map((t) => [t, `${t}_audit`] as [string, string]),
  ...["users", "company_settings", "owners", "properties", "clients", "leads", "opportunities", "visits", "tasks", "notes", "message_templates", "property_matches"].map((t) => [t, `${t}_set_updated_at`] as [string, string]),
  ["leads", "leads_track_stage"],
  ["opportunities", "opportunities_track_stage"],
  ["opportunities", "opportunities_sync_property"],
  ["properties", "properties_track_price"],
  ["activities", "activities_after_insert"],
  ["tasks", "tasks_after_change"],
  ["visits", "visits_after_change"],
];

const setTriggers = async (db: Db, enable: boolean) => {
  for (const [table, trg] of SEED_TRIGGERS) {
    await db.query(`alter table public.${table} ${enable ? "enable" : "disable"} trigger ${trg}`);
  }
};

const DEMO_LOGO = "/brand/altura-logo.svg";

/**
 * Carga datos de demostración coherentes: todo está conectado
 * (lead → oportunidad → propiedad → visitas → cierre) y relativo a "ahora".
 */
export async function seedDemo(db: Db, hooks: SeedHooks, opts: { now?: Date; seed?: number } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const rng = new Rng(opts.seed ?? 20261006);
  const clock = new Clock(now);
  const usdRate = 3.75;

  await setTriggers(db, false);

  // --- Empresa --------------------------------------------------------------------------
  await db.query(
    `update public.company_settings set name = $1, legal_name = $2, tax_id = $3, logo_url = $4, phone = $5, email = $6,
            address = $7, website = $8, usd_exchange_rate = $9 where id = 1`,
    ["Altura Inmobiliaria", "Altura Servicios Inmobiliarios S.A.C.", "20601234567", DEMO_LOGO, "+51 1 640 1200", "contacto@altura.example", "Av. José Larco 1232, Of. 604, Miraflores, Lima", "www.altura.example", usdRate],
  );

  // --- Equipo -------------------------------------------------------------------------------
  const userIds: Record<string, string> = {};
  const userRows: Row[] = [];
  for (const u of DEMO_USERS) {
    const id = await hooks.createAuthUser(db, { email: u.email, password: DEMO_PASSWORD, fullName: u.name });
    userIds[u.key] = id;
    userRows.push({
      id,
      full_name: u.name,
      email: u.email,
      phone: u.phone,
      avatar_url: `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(u.name)}&backgroundColor=e0e7ff,fce7f3,dcfce7,fef3c7,e0f2fe`,
      role: u.role,
      status: "active",
      hired_at: u.hired,
      created_at: new Date(`${u.hired}T09:00:00-05:00`),
      updated_at: new Date(`${u.hired}T09:00:00-05:00`),
    });
  }
  await bulkInsert(db, "users", userRows);

  const advisors: Advisor[] = DEMO_USERS.filter((u) => u.role === "advisor").map((u) => ({ id: userIds[u.key], name: u.name, weight: (u as { weight: number }).weight, mult: (u as { mult: number }).mult }));
  const manager = { id: userIds.manager, name: "Ricardo Paredes" };
  const assistant = { id: userIds.assistant, name: "Daniela Quispe" };
  const creators = [userIds.admin, userIds.manager, ...advisors.map((a) => a.id)];

  // --- Propietarios ------------------------------------------------------------------------------
  const ownerNames = [
    "Teresa Camacho Huamán",
    "Inversiones Pacífico S.A.C.",
    "Jorge Luis Benavides Cano",
    "Constructora Los Andes S.A.C.",
    "Rosa Elena Palacios Vda. de Torres",
    "Hermanos Zevallos Arana",
    "Grupo Inmobiliario Costa Verde S.A.",
    "Manuel Alejandro Ríos Salas",
  ];
  while (ownerNames.length < 44) {
    const p = randomPerson(rng);
    ownerNames.push(rng.chance(0.12) ? rng.pick(COMPANY_NAMES) : p.fullName);
  }
  const uniqueOwnerNames = Array.from(new Set(ownerNames));
  const phones = new Set<string>();
  const owners = uniqueOwnerNames.map((name, i) => {
    const company = /S\.A\.C\.|S\.A\.|E\.I\.R\.L\./.test(name);
    const joint = /^Hermanos|Sucesión|Herederos/.test(name);
    const d = rng.pick(DISTRICTS);
    const createdAt = new Date(now.getTime() - rng.int(50, 420) * DAY);
    return {
      id: uuid(),
      full_name: name,
      doc_type: company ? "ruc" : "dni",
      doc_number: company ? rucFor(rng) : dniFor(rng),
      phone: phoneFor(rng, phones),
      email: emailFor(rng, name.replace(/S\.A\.C\.|S\.A\.|E\.I\.R\.L\./g, "").trim() || `propietario${i}`),
      address: `${rng.pick(d.streets)} ${rng.int(100, 2800)}, ${d.label}`,
      owner_type: company ? "company" : joint ? "joint" : "individual",
      notes: rng.chance(0.3) ? rng.pick(["Prefiere comunicación por WhatsApp.", "Disponible para visitas de lunes a viernes por la tarde.", "Reside en el extranjero; los trámites los gestiona un apoderado.", "Exclusividad por 90 días firmada."]) : null,
      created_by: rng.pick(creators),
      created_at: createdAt,
      updated_at: createdAt,
    } satisfies Row;
  });
  await bulkInsert(db, "owners", owners);
  const ownerIds = owners.map((o) => o.id);

  // --- Propiedades ----------------------------------------------------------------------------------
  const jose = userIds.jose;
  const heroes = [
    { code: "SM-024", district: "san_miguel", type: "apartment" as const, operation: "sale" as const, bedrooms: 3, status: "available" as const, title: "Departamento moderno en San Miguel", street: "Av. La Marina", number: 2450, price: 480000, currency: "PEN" as const, minPrice: 455000, commissionPct: 4, builtArea: 98, totalArea: 104, bathrooms: 2, parking: 1, floor: 8, elevator: true, ageYears: 3, furnished: false, features: ["balcony", "security", "laundry", "pets", "exterior_view", "gym"], advisorId: jose, ownerId: ownerIds[0], createdAt: new Date(now.getTime() - 64 * DAY) },
    { code: "LM-011", district: "la_molina", type: "house" as const, operation: "sale" as const, bedrooms: 4, status: "available" as const, title: "Casa familiar en La Molina", street: "Calle Los Algarrobos", number: 215, price: 420000, currency: "USD" as const, minPrice: 400000, commissionPct: 3.5, builtArea: 280, totalArea: 360, bathrooms: 4, parking: 3, floor: null, elevator: false, ageYears: 9, furnished: false, features: ["garden", "bbq", "security", "laundry", "storage", "pets"], advisorId: userIds.mafe, ownerId: ownerIds[1], createdAt: new Date(now.getTime() - 48 * DAY) },
    { code: "SU-037", district: "surco", type: "apartment" as const, operation: "sale" as const, bedrooms: 3, status: "available" as const, title: "Departamento 3 dormitorios en Surco", street: "Av. Caminos del Inca", number: 1860, price: 585000, currency: "PEN" as const, minPrice: 560000, commissionPct: 3.5, builtArea: 112, totalArea: 118, bathrooms: 2, parking: 2, floor: 6, elevator: true, ageYears: 7, furnished: false, features: ["balcony", "security", "laundry", "storage", "pets", "exterior_view"], advisorId: userIds.camila, ownerId: ownerIds[2], createdAt: new Date(now.getTime() - 41 * DAY) },
    { code: "MF-009", district: "miraflores", type: "office" as const, operation: "sale" as const, bedrooms: null, status: "available" as const, title: "Oficina comercial en Miraflores", street: "Av. Benavides", number: 1544, price: 215000, currency: "USD" as const, minPrice: 205000, commissionPct: 3, builtArea: 85, totalArea: 85, bathrooms: 2, parking: 2, floor: 9, elevator: true, ageYears: 5, furnished: false, features: ["security", "exterior_view", "storage"], advisorId: userIds.luis, ownerId: ownerIds[3], createdAt: new Date(now.getTime() - 55 * DAY) },
    { code: "SMP-006", district: "san_martin_de_porres", type: "commercial" as const, operation: "sale" as const, bedrooms: null, status: "available" as const, title: "Local comercial en San Martín de Porres", street: "Av. Tomás Valle", number: 980, price: 640000, currency: "PEN" as const, minPrice: 610000, commissionPct: 4, builtArea: 120, totalArea: 135, bathrooms: 2, parking: 3, floor: 1, elevator: false, ageYears: 12, furnished: false, features: ["storage", "security"], advisorId: userIds.sofia, ownerId: ownerIds[4], createdAt: new Date(now.getTime() - 36 * DAY) },
  ];

  const props = generateProperties(
    { rng, now, advisorIds: advisors.map((a) => a.id), ownerIds, usdRate },
    heroes,
  );
  const codes = new Set<string>();
  for (const p of props) {
    // Códigos únicos
    while (codes.has(p.code)) p.code = p.code.replace(/\d+$/, (n) => String(Number(n) + 1).padStart(3, "0"));
    codes.add(p.code);
  }

  const pools = {
    all: props,
    open: props.filter((p) => p.status === "available" || p.status === "paused").filter((p) => p.status === "available"),
    reservedFree: props.filter((p) => p.status === "reserved"),
    soldFree: props.filter((p) => p.status === "sold"),
    rentedFree: props.filter((p) => p.status === "rented"),
  };

  // --- Tags -------------------------------------------------------------------------------------------
  const tagRows = await db.query<{ id: string; name: string }>("select id, name from public.tags");
  const tagIds = Object.fromEntries(tagRows.map((t) => [t.name, t.id]));
  const catalog = await db.query<{ catalog: string; key: string; label: string }>("select catalog, key, label from public.catalog_items");
  const labelFor = (cat: string) => (k: string) => catalog.find((c) => c.catalog === cat && c.key === k)?.label ?? k;

  const out: SeedOutput = { leads: [], clients: [], opportunities: [], visits: [], tasks: [], activities: [], notes: [], leadTags: [], clientTags: [], stageHistory: [], audit: [] };
  const ctx: SimContext = {
    rng,
    clock,
    manager,
    assistant,
    advisors,
    pools,
    tagIds,
    phones,
    districtLabel: labelFor("district"),
    sourceLabel: labelFor("lead_source"),
    lossLabel: labelFor("loss_reason"),
    out,
  };
  const sim = new Simulator(ctx);
  const byCode = (code: string) => props.find((p) => p.code === code)!;

  // --- Historias protagonistas (datos conectados de punta a punta) ------------------------------------------------
  // 1) Carlos Mendoza: WhatsApp → calificado → Departamento SM-024 → 2 visitas → negociación (S/ 480,000)
  const carlos = sim.run({
    name: "Carlos Mendoza",
    phone: "987 654 321",
    email: "carlos.mendoza84@example.com",
    source: "whatsapp",
    advisorId: jose,
    operation: "buy",
    property: byCode("SM-024"),
    timesAgo: [21, 20.99, 20, 19, 18, 14.9, 3.8],
    reach: "negotiation",
    visitOutcomes: ["interested"],
    priority: "high",
    interestLevel: "high",
    financing: "mortgage",
    probability: 75,
    value: 480000,
    convertToClient: true,
    tags: ["VIP", "Crédito hipotecario", "San Miguel"],
    profile: { budgetMin: 450000, budgetMax: 520000, currency: "PEN", districts: ["san_miguel", "magdalena", "pueblo_libre"], bedroomsMin: 3, bathroomsMin: 2, areaMin: 90, purchaseInDays: 45 },
    messageText: "Hola, vi el departamento SM-024 en San Miguel y quisiera más información. ¿Sigue disponible?",
    tasks: [
      { title: "Llamar a Carlos Mendoza", kind: "call", dueDay: 0, hour: 10 },
      { title: "Seguimiento de negociación — Carlos Mendoza", kind: "follow_up", dueDay: 0, hour: 16 },
    ],
  });
  {
    // Segunda visita (muy interesado) 4 días atrás
    const opp = out.opportunities.find((o) => o.lead_id === carlos.leadId)!;
    const at = clock.at(-4, 11, 30);
    const vid = uuid();
    out.visits.push(mkVisit({ id: vid, property_id: byCode("SM-024").id, lead_id: carlos.leadId, client_id: carlos.clientId, opportunity_id: opp.id, advisor_id: jose, scheduled_at: at, duration_min: 60, status: "completed", outcome: "very_interested", advisor_notes: "Segunda visita con su esposa. Les encantó la luz y la cocina. Piden rebaja del 4% y revisar fecha de entrega.", observations: "Asistió con su pareja.", confirmed_at: new Date(at.getTime() - 20 * HOUR), completed_at: new Date(at.getTime() + 75 * MIN), created_by: jose, created_at: clock.at(-6, 15, 10), updated_at: at }));
    out.activities.push(
      mkActivity({ type: "system", event: "visit_scheduled", title: eventTitle("visit_scheduled", { code: "SM-024" }), lead_id: carlos.leadId, opportunity_id: opp.id as string, property_id: byCode("SM-024").id, visit_id: vid, user_id: jose, occurred_at: clock.at(-6, 15, 12), created_at: clock.at(-6, 15, 12) }),
      mkActivity({ type: "visit", title: "Visita a SM-024 · Muy interesado", body: "Segunda visita con su esposa. Les encantó la luz y la cocina.", lead_id: carlos.leadId, opportunity_id: opp.id as string, property_id: byCode("SM-024").id, visit_id: vid, user_id: jose, occurred_at: new Date(at.getTime() + 80 * MIN), created_at: new Date(at.getTime() + 80 * MIN) }),
      mkActivity({ type: "whatsapp", title: "WhatsApp: propuesta de precio", body: "Carlos propone S/ 462,000 con crédito hipotecario. Se consulta con la propietaria.", responded: true, lead_id: carlos.leadId, opportunity_id: opp.id as string, property_id: byCode("SM-024").id, user_id: jose, occurred_at: clock.at(-1, 18, 20), created_at: clock.at(-1, 18, 20) }),
      mkActivity({ type: "call", title: "Llamada con la propietaria", body: "Teresa acepta bajar hasta S/ 470,000 si se firma antes de fin de mes.", responded: true, lead_id: carlos.leadId, opportunity_id: opp.id as string, property_id: byCode("SM-024").id, owner_id: ownerIds[0], user_id: jose, occurred_at: clock.at(-1, 19, 5), created_at: clock.at(-1, 19, 5) }),
    );
  }
  // 2) Andrea Salazar: lead nuevo de Instagram, recién asignada a José López
  sim.run({ name: "Andrea Salazar", source: "instagram", advisorId: jose, operation: "buy", timesAgo: [0.09], reach: "new", priority: "high", profile: { propertyType: "apartment", districts: ["barranco", "miraflores"] }, tasks: [{ title: "Llamar a Andrea Salazar", kind: "call", dueDay: 0, hour: 12, minute: 30 }] });
  // 3) Luis Fernández: inversionista que ya cerró una compra hace 6 días
  sim.run({ name: "Luis Fernández", source: "referral", advisorId: userIds.mafe, operation: "invest", timesAgo: [70, 69.99, 68, 66, 64, 60, 52, 40, 6], reach: "won", visitOutcomes: ["very_interested"], priority: "high", interestLevel: "high", financing: "cash", tags: ["Inversionista", "Cliente recurrente"], convertToClient: true });
  // 4) Valeria Torres: búsqueda de alquiler, visita mañana sin confirmar
  sim.run({ name: "Valeria Torres", source: "web", advisorId: userIds.mafe, operation: "rent", timesAgo: [9, 8.99, 8, 6.5, 5], reach: "visit_scheduled", visitAtOffset: { day: 1, hour: 11 }, visitStatus: "scheduled", priority: "high", interestLevel: "urgent", convertToClient: true, tags: ["Alquiler", "Surco"], profile: { propertyType: "apartment", districts: ["surco", "san_borja"], budgetMin: 3000, budgetMax: 4000, currency: "PEN", bedroomsMin: 3, bathroomsMin: 2, areaMin: 90, purchaseInDays: 20 }, tasks: [{ title: "Confirmar visita con Valeria Torres", kind: "visit", dueDay: 0, hour: 11, minute: 30 }] });
  // 5) Diego Ramírez: negociación de oficina estancada hace 12 días
  sim.run({ name: "Diego Ramírez", source: "google", advisorId: userIds.luis, operation: "buy", property: byCode("MF-009"), timesAgo: [38, 37.99, 36, 34, 33, 28, 14.5], reach: "negotiation", visitOutcomes: ["interested"], stalled: true, priority: "high", interestLevel: "medium", financing: "mortgage", probability: 50, profile: { propertyType: "office", districts: ["miraflores", "san_isidro"], budgetMin: 190000, budgetMax: 230000, currency: "USD", areaMin: 70 }, tasks: [{ title: "Seguimiento de negociación — Diego Ramírez", kind: "follow_up", dueDay: -5, hour: 11 }] });

  // --- Cierres, reservas y visitas distribuidos entre el equipo -----------------------------------------------------
  const outcomePick = () => rng.pick(["very_interested", "interested"] as const);
  const wins: Array<[string, number]> = [["luis", 3], ["luis", 19], ["sofia", 11], ["camila", 5], ["mafe", 22], ["jose", 9], ["camila", 27], ["luis", 36], ["sofia", 48], ["jose", 14]];
  for (const [k, w] of wins) {
    sim.run({ advisorId: userIds[k], reach: "won", timesAgo: [w + 44, w + 43.99, w + 40, w + 36, w + 33, w + 25, w + 16, w + 8, w], visitOutcomes: [outcomePick()], priority: "high", interestLevel: "high" });
  }
  const reserves: Array<[string, number]> = [["jose", 2], ["mafe", 4], ["camila", 7], ["luis", 5], ["sofia", 9], ["jose", 12]];
  for (const [k, r] of reserves) {
    sim.run({ advisorId: userIds[k], reach: "reserved", timesAgo: [r + 32, r + 31.99, r + 28, r + 24, r + 21, r + 14, r + 7, r], visitOutcomes: [outcomePick()], priority: "high", interestLevel: "high", probability: 90 });
  }
  const visitDays = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6];
  const hourNow = clock.hour(now);
  for (const d of visitDays) {
    let day = d;
    let hour = rng.int(9, 18);
    if (d === 0) {
      if (hourNow >= 17) day = 1;
      else hour = Math.min(19, Math.max(9, hourNow + rng.int(1, 3)));
    }
    const c = rng.float(6, 14);
    sim.run({ reach: "visit_scheduled", timesAgo: [c, c - 0.01, c - 1.5, c - 2.5, c - 3.5], visitAtOffset: { day, hour, minute: rng.pick([0, 30]) }, advisorId: rng.weighted(advisors.map((a) => [a.id, a.weight] as const)) });
  }

  // --- Leads masivos ---------------------------------------------------------------------------------------------
  for (let i = 0; i < 270; i++) sim.run({});

  // Leads recién ingresados sin vendedor (alerta "sin asignar")
  for (let i = 0; i < 5; i++) sim.run({ advisorId: null, timesAgo: [rng.float(0.05, 1.6)], reach: "new", source: rng.pick(["whatsapp", "web", "facebook", "instagram", "portal"]), noAutoTask: true });

  // Posibles duplicados: mismo teléfono con distinto formato/nombre
  const recent = out.leads.filter((l) => l.assigned_to && l.phone && (l.created_at as Date).getTime() > now.getTime() - 45 * DAY).slice(0, 12);
  for (const base of rng.sample(recent, 3)) {
    const parts = String(base.full_name).split(" ");
    const variant = `${parts[0]} ${parts[1]?.[0] ?? ""}.`.replace(" .", "");
    sim.run({ name: `${variant}`, phone: String(base.phone).replace(/ /g, ""), source: rng.pick(["web", "facebook", "portal"]), advisorId: null, timesAgo: [rng.float(0.2, 2)], reach: "new", noAutoTask: true });
  }

  // Clientes directos (captados sin pasar por lead)
  const directs: Array<{ clientId: string; name: string; advisor: Advisor }> = [];
  for (let i = 0; i < 16; i++) {
    const advisor = rng.weighted(advisors.map((a) => [a, a.weight] as const));
    const r = directClient(ctx, { advisor, at: new Date(now.getTime() - rng.int(8, 160) * DAY), tags: rng.chance(0.3) ? [rng.pick(["VIP", "Cliente recurrente", "Compra urgente"])] : [] });
    directs.push({ ...r, advisor });
  }
  // Cliente de ejemplo para el flujo de matching: Diana Arce
  {
    const advisor = advisors.find((a) => a.id === userIds.camila)!;
    const r = directClient(ctx, {
      advisor,
      name: "Diana Arce Montalvo",
      at: new Date(now.getTime() - 6 * DAY),
      source: "referral",
      tags: ["Crédito hipotecario", "San Miguel"],
      profile: { operation_type: "buy", property_type: "apartment", budget_min: 400000, budget_max: 550000, currency: "PEN", districts: ["san_miguel", "magdalena", "pueblo_libre"] as unknown as string, bedrooms_min: 3, bathrooms_min: 2, area_min: 90, area_max: null, financing: "mortgage" },
    });
    directs.push({ ...r, advisor });
    out.tasks.push(mkTask({ title: "Enviar propiedades a Diana Arce Montalvo", kind: "send_properties", assigned_to: advisor.id, created_by: advisor.id, client_id: r.clientId, due_at: clock.at(0, 15, 0), priority: "high", created_at: clock.at(-1, 18), updated_at: clock.at(-1, 18) }));
  }
  // Tareas / actividades de seguimiento para clientes directos
  for (const d of directs) {
    if (rng.chance(0.55)) {
      const at = new Date(now.getTime() - rng.int(1, 40) * DAY);
      out.activities.push(mkActivity({ type: rng.pick(["call", "whatsapp", "email"] as const), title: "Contacto con el cliente", body: rng.pick([...TEXT.callAnswered, ...TEXT.whatsappAnswered]), responded: true, client_id: d.clientId, user_id: d.advisor.id, occurred_at: at, created_at: at }));
    }
    if (rng.chance(0.4)) {
      const due = clock.at(rng.int(-2, 6), rng.int(9, 18), rng.pick([0, 30]));
      out.tasks.push(mkTask({ title: `Seguimiento con ${d.name}`, kind: "follow_up", assigned_to: d.advisor.id, created_by: d.advisor.id, client_id: d.clientId, due_at: due, priority: "medium", created_at: new Date(Math.min(now.getTime(), due.getTime()) - 2 * DAY), updated_at: now }));
    }
  }

  // --- Ajustes de coherencia del inventario ---------------------------------------------------------------
  for (const p of [...pools.reservedFree, ...pools.soldFree, ...pools.rentedFree]) p.status = "available"; // sin oportunidad que los respalde

  // --- Inserción ---------------------------------------------------------------------------------------------------
  const propertyRows: Row[] = props.map((p) => {
    const published = p.publicationStatus !== "pending";
    const publishedAt = published ? new Date(Math.min(now.getTime() - HOUR, p.createdAt.getTime() + rng.int(1, 4) * DAY)) : null;
    return {
      id: p.id,
      code: p.code,
      title: p.title,
      description: p.description,
      property_type: p.propertyType,
      operation: p.operation,
      price: p.price,
      currency: p.currency,
      min_price: p.minPrice,
      commission_pct: p.commissionPct,
      district: p.district,
      province: "Lima",
      address: p.address,
      reference: p.reference,
      latitude: p.latitude,
      longitude: p.longitude,
      total_area: p.totalArea,
      built_area: p.builtArea,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      parking: p.parking,
      age_years: p.ageYears,
      floor: p.floor,
      elevator: p.elevator,
      furnished: p.furnished,
      features: p.features,
      status: p.status,
      publication_status: p.publicationStatus,
      owner_id: p.ownerId,
      advisor_id: p.advisorId,
      published_at: publishedAt,
      created_by: p.advisorId,
      created_at: p.createdAt,
      updated_at: p.priceDrops[0]?.at ?? p.createdAt,
    };
  });
  await bulkInsert(db, "properties", propertyRows);
  await bulkInsert(
    db,
    "property_images",
    props.flatMap((p) => p.images.map((img, i) => ({ id: uuid(), property_id: p.id, url: img.url, storage_path: null, caption: img.caption, position: i, is_cover: i === 0, created_at: p.createdAt }))),
  );
  const priceHistory: Row[] = [];
  for (const p of props) {
    const first = p.priceDrops[0]?.from ?? p.price;
    priceHistory.push({ id: uuid(), property_id: p.id, old_price: null, new_price: first, currency: p.currency, changed_by: p.advisorId, changed_at: p.createdAt });
    for (const d of p.priceDrops) {
      priceHistory.push({ id: uuid(), property_id: p.id, old_price: d.from, new_price: p.price, currency: p.currency, changed_by: p.advisorId, changed_at: d.at });
      out.audit.push({ id: uuid(), user_id: p.advisorId, entity_type: "properties", entity_id: p.id, entity_label: `${p.code} · ${p.title}`, action: "update", event: "price_change", changes: json({ price: { from: d.from, to: p.price } }), created_at: d.at });
      out.activities.push(mkActivity({ type: "system", event: "price_changed", title: eventTitle("price_changed", { from: formatMoney(d.from, p.currency), to: formatMoney(p.price, p.currency) }), property_id: p.id, owner_id: p.ownerId, user_id: p.advisorId, occurred_at: d.at, created_at: d.at }));
    }
    out.activities.push(mkActivity({ type: "system", event: "property_listed", title: eventTitle("property_listed", { code: p.code }), property_id: p.id, owner_id: p.ownerId, user_id: p.advisorId, occurred_at: p.createdAt, created_at: p.createdAt }));
  }
  await bulkInsert(db, "property_price_history", priceHistory);

  // Reuniones con propietarios (historial del propietario)
  for (const o of rng.sample(owners, 12)) {
    const prop = props.find((p) => p.ownerId === o.id);
    if (!prop) continue;
    const at = new Date(now.getTime() - rng.int(3, 60) * DAY);
    out.activities.push(
      mkActivity({ type: "meeting", title: "Reunión con el propietario", body: rng.pick(["Se acordó la estrategia de precio y publicación en portales.", "Revisión de documentos y firma de autorización de venta.", "Se presentó el informe de visitas y feedback de interesados.", "Se coordinó la sesión de fotos profesionales."]), owner_id: o.id, property_id: prop.id, user_id: prop.advisorId, occurred_at: at, created_at: at }),
    );
  }

  await bulkInsert(db, "clients", out.clients);
  await bulkInsert(db, "leads", out.leads);
  await bulkInsert(db, "lead_tags", dedupe(out.leadTags, ["lead_id", "tag_id"]));
  await bulkInsert(db, "client_tags", dedupe(out.clientTags, ["client_id", "tag_id"]));
  await bulkInsert(db, "opportunities", out.opportunities);
  await bulkInsert(db, "visits", out.visits);
  await bulkInsert(db, "tasks", out.tasks);
  await bulkInsert(db, "notes", out.notes);
  await bulkInsert(db, "activities", out.activities);

  // Etapas del lead tras las conversiones (client_id se asignó en memoria)
  await bulkInsert(db, "stage_history", out.stageHistory);
  const auditRecent = out.audit.filter((a) => (a.created_at as Date).getTime() > now.getTime() - 75 * DAY).slice(-600);
  await bulkInsert(db, "audit_logs", auditRecent);

  // --- Campos derivados y score -----------------------------------------------------------------------------------
  await refreshDerivedFields(db);
  await recomputeLeadScores(db, undefined, now);

  // Reservas: propiedad reservada por la oportunidad (equivalente al trigger deshabilitado)
  await db.query(`
    update public.properties p set status = 'reserved'
      from public.opportunities o where o.property_id = p.id and o.stage = 'reserved' and p.status = 'available'`);
  await db.query(`
    update public.properties p set status = case when p.operation = 'sale' then 'sold' else 'rented' end
      from public.opportunities o where o.property_id = p.id and o.stage = 'won'`);
  // Oportunidades en curso sobre propiedades que ya no están disponibles se descartan de las "abiertas" por consistencia visual
  // (no ocurre por construcción: las vendidas/reservadas solo se asignan a su propia oportunidad)

  // --- Matches guardados (muestra el motor de matching) ------------------------------------------------------------------
  const matchables: Array<{ id: string; m: MatchableProperty }> = props.map((p) => ({
    id: p.id,
    m: { id: p.id, operation: p.operation, propertyType: p.propertyType, price: p.price, minPrice: p.minPrice, currency: p.currency, district: p.district, bedrooms: p.bedrooms, bathrooms: p.bathrooms, totalArea: p.totalArea, builtArea: p.builtArea },
  }));
  const matchRows: Row[] = [];
  const candidates = [
    ...out.clients.filter((c) => c.operation_type && ((c.budget_max as number | null) != null)).slice(-25).map((c) => ({ kind: "client" as const, row: c })),
    ...out.leads.filter((l) => l.stage === "qualified" || l.stage === "opportunity").slice(0, 25).map((l) => ({ kind: "lead" as const, row: l })),
  ];
  for (const cand of candidates) {
    const r = cand.row;
    const profile: SearchProfile = {
      operationType: r.operation_type as SearchProfile["operationType"],
      propertyType: r.property_type as string | null,
      budgetMin: r.budget_min as number | null,
      budgetMax: r.budget_max as number | null,
      currency: (r.currency as "PEN" | "USD") ?? "PEN",
      districts: (r.districts as string[]) ?? [],
      bedroomsMin: r.bedrooms_min as number | null,
      bathroomsMin: r.bathrooms_min as number | null,
      areaMin: r.area_min as number | null,
      areaMax: r.area_max as number | null,
    };
    const scored = matchables
      .filter((x) => props.find((p) => p.id === x.id)!.status === "available")
      .map((x) => ({ id: x.id, res: matchProperty(profile, x.m, { usdRate, districtLabel: ctx.districtLabel, typeLabel: labelFor("property_type") }) }))
      .filter((x) => x.res.eligible && x.res.score >= 60)
      .sort((a, b) => b.res.score - a.res.score)
      .slice(0, 3);
    scored.forEach((s, i) => {
      matchRows.push({
        id: uuid(),
        property_id: s.id,
        lead_id: cand.kind === "lead" ? (r.id as string) : null,
        client_id: cand.kind === "client" ? (r.id as string) : null,
        score: s.res.score,
        reasons: json(s.res.reasons),
        status: i === 0 && rng.chance(0.6) ? "sent" : "suggested",
        sent_at: i === 0 ? new Date(now.getTime() - rng.int(1, 12) * DAY) : null,
        created_by: (r.assigned_to as string) ?? null,
        created_at: new Date(now.getTime() - rng.int(1, 14) * DAY),
        updated_at: now,
      });
    });
  }
  await bulkInsert(db, "property_matches", matchRows);

  // --- Documentos de ejemplo (archivos reales para poder descargarlos) ---------------------------------------------------------
  if (hooks.putFile) {
    const docs: Row[] = [];
    const add = async (parent: { owner_id?: string; client_id?: string; property_id?: string }, name: string, category: string, lines: string[], uploader: string) => {
      const id = uuid();
      const folder = parent.owner_id ? `owners/${parent.owner_id}` : parent.client_id ? `clients/${parent.client_id}` : `properties/${parent.property_id}`;
      const path = `${folder}/${id}.pdf`;
      const bytes = minimalPdf(name.replace(/\.pdf$/, ""), lines);
      await hooks.putFile!(path, bytes, "application/pdf");
      docs.push({ id, name, category, storage_path: path, mime_type: "application/pdf", size_bytes: bytes.byteLength, owner_id: parent.owner_id ?? null, client_id: parent.client_id ?? null, property_id: parent.property_id ?? null, lead_id: null, uploaded_by: uploader, created_at: new Date(now.getTime() - rng.int(2, 60) * DAY) });
    };
    for (const o of owners.slice(0, 6)) {
      const prop = props.find((p) => p.ownerId === o.id);
      await add({ owner_id: o.id as string }, `DNI-${(o.full_name as string).split(" ")[0]}.pdf`, "identity", [`Documento de identidad de ${o.full_name}`, "Copia simple - documento demostrativo (datos ficticios)."], prop?.advisorId ?? userIds.manager);
      if (prop) await add({ property_id: prop.id }, `Autorizacion-de-venta-${prop.code}.pdf`, "contract", [`Autorizacion de venta / alquiler ${prop.code}`, prop.title, "Documento demostrativo (datos ficticios)."], prop.advisorId);
    }
    for (const p of props.slice(0, 4)) await add({ property_id: p.id }, `Planos-${p.code}.pdf`, "plans", [`Planos de distribucion ${p.code}`, p.title, "Documento demostrativo (datos ficticios)."], p.advisorId);
    await add({ client_id: carlos.clientId! }, "Pre-aprobacion-credito-hipotecario.pdf", "financing", ["Pre-aprobacion de credito hipotecario", "Cliente: Carlos Mendoza", "Monto aprobado referencial: S/ 400,000 (demostrativo)."], jose);
    await bulkInsert(db, "documents", docs);
  }

  // --- Notificaciones -------------------------------------------------------------------------------------------------------------
  await syncAlertNotifications(db, { now, force: true });
  const notifRows: Row[] = [];
  for (const l of out.leads.filter((x) => x.assigned_to && (x.assigned_at as Date | null) && now.getTime() - (x.assigned_at as Date).getTime() < 3 * DAY)) {
    notifRows.push({
      id: uuid(),
      user_id: l.assigned_to as string,
      type: "lead_assigned",
      title: `Nuevo lead asignado: ${l.full_name}`,
      body: `${ctx.sourceLabel(l.source as string)} · ${l.phone ?? l.email}`,
      href: `/leads/${l.id}`,
      entity_type: "lead",
      entity_id: l.id as string,
      dedupe_key: notifKey.leadAssigned(l.id as string, l.assigned_to as string),
      read_at: null,
      created_at: l.assigned_at,
    });
  }
  for (const o of out.opportunities.filter((x) => (x.created_at as Date).getTime() > now.getTime() - 2 * DAY)) {
    notifRows.push({ id: uuid(), user_id: manager.id, type: "opportunity_new", title: "Nueva oportunidad creada", body: `Valor ${formatMoney(o.value as number, o.currency as "PEN" | "USD")}`, href: `/opportunities/${o.id}`, entity_type: "opportunity", entity_id: o.id as string, dedupe_key: notifKey.oppNew(o.id as string), read_at: null, created_at: o.created_at });
  }
  for (const c of out.clients.filter((x) => (x.created_at as Date).getTime() > now.getTime() - 4 * DAY)) {
    notifRows.push({ id: uuid(), user_id: c.assigned_to as string, type: "client_new", title: `Nuevo cliente: ${c.full_name}`, body: null, href: `/clients/${c.id}`, entity_type: "client", entity_id: c.id as string, dedupe_key: notifKey.clientNew(c.id as string), read_at: null, created_at: c.created_at });
  }
  for (const o of out.opportunities.filter((x) => x.stage === "reserved")) {
    const prop = props.find((p) => p.id === o.property_id)!;
    notifRows.push({ id: uuid(), user_id: manager.id, type: "property_reserved", title: `${prop.code} cambió a reservado`, body: prop.title, href: `/properties/${prop.id}`, entity_type: "property", entity_id: prop.id, dedupe_key: notifKey.propertyReserved(prop.id, o.id as string), read_at: null, created_at: o.stage_changed_at });
  }
  await bulkInsert(db, "notifications", notifRows.filter((n) => n.user_id));
  // Lo más antiguo ya se leyó
  await db.query(`update public.notifications set read_at = created_at + interval '3 hours' where created_at < now() - interval '30 hours'`);
  await db.query(`update public.notifications set read_at = created_at + interval '40 minutes' where read_at is null and random() < 0.15`);

  await setTriggers(db, true);
  await db.query("analyze");
}

function dedupe(rows: Row[], keys: string[]): Row[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = keys.map((c) => r[c]).join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
