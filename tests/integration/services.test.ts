import { describe, expect, it } from "vitest";
import { getLookups } from "@/lib/catalogs";
import { resolvePeriod } from "@/lib/domain/dates";
import { commercialTables, exportLeads, exportVisits, teamTables } from "@/lib/export/builders";
import { toCsv } from "@/lib/export/tabular";
import { withAdmin, withUser } from "@/lib/db";
import { getAlerts } from "@/lib/services/alerts";
import { listAudit } from "@/lib/services/audit";
import { calendarEvents } from "@/lib/services/calendar";
import { getDashboard } from "@/lib/services/dashboard";
import { importRows, validateImport } from "@/lib/services/lead-import";
import { getCommercialReport, getFollowupReport, getPipelineReport, getPropertiesReport } from "@/lib/services/reports";
import { getTeamStats } from "@/lib/services/team";
import { createTask, listTasks, setTaskStatus } from "@/lib/services/tasks";
import { resetUserPassword, updateUserAccount } from "@/lib/services/users";
import { auditQuerySchema } from "@/lib/validation/activities";
import { taskListQuerySchema } from "@/lib/validation/tasks";
import { actorByRole, admin, count } from "./helpers";

describe("importación de leads", () => {
  it("valida, detecta duplicados e importa respetando los permisos del usuario", async () => {
    const assistant = await actorByRole("assistant");
    const advisor = await actorByRole("advisor", 0);
    const existing = await admin((db) => db.one<{ phone: string }>("select phone from public.leads where phone is not null limit 1"));
    const opts = { defaultSource: "web", defaultAssignee: "", duplicates: "skip" as const };
    const rows = [
      { row: 1, values: { fullName: "Importado Uno", phone: "955777001", email: "uno@example.com", operationType: "Compra", budgetMax: "S/ 350,000" } },
      { row: 2, values: { fullName: "Sin contacto" } },
      { row: 3, values: { fullName: "Repetido de la base", phone: existing!.phone } },
      { row: 4, values: { fullName: "Importado Uno bis", phone: "955 777 001" } },
      { row: 5, values: { fullName: "Importado Dos", phone: "955777002", assignedTo: advisor.session.fullName } },
    ];

    const review = await assistant.run((db) => validateImport(db, assistant.session, rows, opts));
    expect(review.map((r) => r.status)).toEqual(["ok", "error", "duplicate", "duplicate", "ok"]);
    expect(review[2].duplicate?.reason).toMatch(/teléfono/i);
    expect(review[3].duplicate?.reason).toMatch(/fila 1/i);

    const toImport = rows.filter((_, i) => review[i].status === "ok");
    const outcomes = await importRows(toImport, opts, { session: assistant.session, run: (fn) => withUser({ id: assistant.session.id, email: assistant.session.email }, fn) });
    expect(outcomes.map((o) => o.result)).toEqual(["created", "created"]);

    const created = await admin((db) => db.query<{ full_name: string; assigned_to: string | null; budget_max: number | null; source: string }>("select full_name, assigned_to, budget_max, source from public.leads where phone in ('955777001', '955777002') order by full_name"));
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ full_name: "Importado Dos", assigned_to: advisor.session.id });
    expect(created[1]).toMatchObject({ full_name: "Importado Uno", assigned_to: null, budget_max: 350_000, source: "web" });

    // Reimportar el mismo archivo omite todo lo ya cargado
    const again = await importRows(toImport, opts, { session: assistant.session, run: (fn) => withUser({ id: assistant.session.id, email: assistant.session.email }, fn) });
    expect(again.map((o) => o.result)).toEqual(["skipped", "skipped"]);
    expect(await admin((db) => count(db, "select count(*) from public.leads where phone in ('955777001', '955777002')"))).toBe(2);
  });

  it("un asesor solo puede importar leads a su nombre", async () => {
    const advisor = await actorByRole("advisor", 1);
    const other = await actorByRole("advisor", 2);
    const opts = { defaultSource: "web", defaultAssignee: other.session.id, duplicates: "skip" as const };
    const out = await importRows([{ row: 1, values: { fullName: "Importado por asesor", phone: "955777003", assignedTo: other.session.fullName } }], opts, { session: advisor.session, run: (fn) => withUser({ id: advisor.session.id, email: advisor.session.email }, fn) });
    expect(out[0].result).toBe("created");
    const lead = await admin((db) => db.one<{ assigned_to: string }>("select assigned_to from public.leads where phone = '955777003'"));
    expect(lead?.assigned_to).toBe(advisor.session.id);
  });
});

describe("usuarios", () => {
  it("no permite dejar al sistema sin administradores ni cambiar el propio rol", async () => {
    const adminActor = await actorByRole("admin");
    const base = { id: adminActor.session.id, fullName: adminActor.session.fullName, phone: "", role: "admin" as const, status: "active" as const, reassignTo: "" };
    await expect(withAdmin((db) => updateUserAccount(db, adminActor.session, { ...base, status: "inactive" }))).rejects.toThrow(/tu propia cuenta/i);
    await expect(withAdmin((db) => updateUserAccount(db, adminActor.session, { ...base, role: "manager" }))).rejects.toThrow(/propio rol/i);
  });

  it("al desactivar a un asesor traspasa su trabajo abierto", async () => {
    const adminActor = await actorByRole("admin");
    const from = await actorByRole("advisor", 4);
    const to = await actorByRole("advisor", 0);
    const before = await admin((db) => count(db, "select count(*) from public.leads where assigned_to = $1 and stage not in ('won', 'lost')", [from.session.id]));
    const toBefore = await admin((db) => count(db, "select count(*) from public.leads where assigned_to = $1 and stage not in ('won', 'lost')", [to.session.id]));
    expect(before).toBeGreaterThan(0);
    const res = await withAdmin((db) => updateUserAccount(db, adminActor.session, { id: from.session.id, fullName: from.session.fullName, phone: "", role: "advisor", status: "inactive", reassignTo: to.session.id }));
    expect(res.reassigned?.leads).toBe(before);
    expect(await admin((db) => count(db, "select count(*) from public.leads where assigned_to = $1 and stage not in ('won', 'lost')", [from.session.id]))).toBe(0);
    expect(await admin((db) => count(db, "select count(*) from public.leads where assigned_to = $1 and stage not in ('won', 'lost')", [to.session.id]))).toBe(toBefore + before);
    // El usuario inactivo ya no puede operar (RLS exige estar activo)
    expect(await from.run((db) => count(db, "select count(*) from public.leads"))).toBe(0);
  });

  it("restablece contraseñas con hash", async () => {
    const u = await actorByRole("advisor", 1);
    await withAdmin((db) => resetUserPassword(db, u.session.id, "NuevaClave2026"));
    const { verifyPassword } = await import("@/lib/auth/password");
    const row = await admin((db) => db.one<{ encrypted_password: string }>("select encrypted_password from auth.users where id = $1", [u.session.id]));
    expect(verifyPassword("NuevaClave2026", row!.encrypted_password)).toBe(true);
  });
});

describe("tareas y calendario", () => {
  it("crea, lista, completa y refleja la tarea en el calendario", async () => {
    const advisor = await actorByRole("advisor", 0);
    const due = new Date(Date.now() + 2 * 3_600_000);
    const lima = new Date(due.getTime() - 5 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, "0");
    const dueAt = `${lima.getUTCFullYear()}-${p(lima.getUTCMonth() + 1)}-${p(lima.getUTCDate())}T${p(lima.getUTCHours())}:${p(lima.getUTCMinutes())}`;
    const { id } = await advisor.run((db) => createTask(db, advisor.session, { title: "Llamar a cliente de prueba", description: "", kind: "call", assignedTo: advisor.session.id, priority: "high", dueAt, leadId: "", clientId: "", opportunityId: "", propertyId: "" }));

    const q = taskListQuerySchema.parse({ tab: "today", user: advisor.session.id });
    const today = await advisor.run((db) => listTasks(db, advisor.session, q));
    expect(today.rows.some((t) => t.id === id)).toBe(true);
    expect(today.counts.today).toBeGreaterThan(0);

    const events = await advisor.run((db) => calendarEvents(db, new Date(Date.now() - 86_400_000).toISOString(), new Date(Date.now() + 86_400_000).toISOString(), advisor.session.id));
    expect(events.some((e) => e.id === id && e.kind === "call")).toBe(true);

    await advisor.run((db) => setTaskStatus(db, advisor.session, id, "completed"));
    const done = await advisor.run((db) => listTasks(db, advisor.session, taskListQuerySchema.parse({ tab: "completed", user: advisor.session.id })));
    expect(done.rows.some((t) => t.id === id && t.completed_at)).toBe(true);
  });

  it("un asesor no ve las tareas de otros", async () => {
    const advisor = await actorByRole("advisor", 3);
    const foreign = await advisor.run((db) => count(db, "select count(*) from public.tasks where assigned_to <> $1 and created_by <> $1", [advisor.session.id]));
    expect(foreign).toBe(0);
  });
});

describe("dashboard, reportes y equipo (cifras calculadas desde la base)", () => {
  const period = resolvePeriod("90d");

  it("el dashboard coincide con consultas directas", async () => {
    const manager = await actorByRole("manager");
    const dash = await manager.run((db) => getDashboard(db, { period, ownerId: null, viewerId: manager.session.id, currency: "PEN", usdRate: 3.75 }));
    const leads = await admin((db) => count(db, "select count(*) from public.leads where created_at >= $1 and created_at < $2", [period.fromIso, period.toIso]));
    const open = await admin((db) => count(db, "select count(*) from public.opportunities o join public.pipeline_stages s on s.key = o.stage and s.kind = 'open'"));
    const won = await admin((db) => count(db, "select count(*) from public.opportunities where stage = 'won' and won_at >= $1 and won_at < $2", [period.fromIso, period.toIso]));
    expect(dash.kpis.newLeads.value).toBe(leads);
    expect(dash.kpis.openOpportunities.count).toBe(open);
    expect(dash.kpis.closedDeals.value).toBe(won);
    expect(dash.kpis.openOpportunities.weighted).toBeLessThanOrEqual(dash.kpis.openOpportunities.value);
    expect(dash.salesByAdvisor.reduce((a, s) => a + s.count, 0)).toBe(won);
  });

  it("las métricas por vendedor suman el total de la empresa", async () => {
    const manager = await actorByRole("manager");
    const stats = await manager.run((db) => getTeamStats(db, period, "PEN", 3.75));
    const wonTotal = stats.reduce((a, s) => a + s.won_count, 0);
    const wonDb = await admin((db) => count(db, "select count(*) from public.opportunities o join public.users u on u.id = o.assigned_to and u.role in ('advisor','manager','admin') where o.stage = 'won' and o.won_at >= $1 and o.won_at < $2", [period.fromIso, period.toIso]));
    expect(wonTotal).toBe(wonDb);
    for (const s of stats) {
      expect(s.conversion).toBeGreaterThanOrEqual(0);
      expect(s.conversion).toBeLessThanOrEqual(100);
    }
  });

  it("los reportes responden y son consistentes", async () => {
    const manager = await actorByRole("manager");
    const params = { period, ownerId: null, currency: "PEN" as const, usdRate: 3.75 };
    const [commercial, pipeline, properties, followup] = await manager.run(async (db) => [await getCommercialReport(db, params), await getPipelineReport(db, params), await getPropertiesReport(db, params), await getFollowupReport(db, params)] as const);
    expect(commercial.kpis.won).toBe(commercial.series.reduce((a, s) => a + s.won, 0));
    expect(commercial.kpis.leads).toBe(commercial.series.reduce((a, s) => a + s.leads, 0));
    expect(pipeline.totals.weighted).toBeLessThanOrEqual(pipeline.totals.value);
    expect(pipeline.byStage.every((s) => s.weighted <= s.value)).toBe(true);
    expect(properties.byStatus.reduce((a, s) => a + s.count, 0)).toBeGreaterThan(0);
    expect(followup.visits.completed + followup.visits.cancelled + followup.visits.noShow).toBeLessThanOrEqual(followup.visits.total);
  });

  it("un asesor ve reportes solo de su trabajo", async () => {
    const advisor = await actorByRole("advisor", 0);
    const own = await advisor.run((db) => getCommercialReport(db, { period, ownerId: advisor.session.id, currency: "PEN", usdRate: 3.75 }));
    const all = await (await actorByRole("manager")).run((db) => getCommercialReport(db, { period, ownerId: null, currency: "PEN", usdRate: 3.75 }));
    expect(own.kpis.leads).toBeLessThan(all.kpis.leads);
  });

  it("las alertas del asesor cuentan solo lo suyo", async () => {
    const advisor = await actorByRole("advisor", 0);
    const mine = await advisor.run((db) => getAlerts(db, advisor.session.id));
    const everything = await (await actorByRole("manager")).run((db) => getAlerts(db, null));
    const sum = (a: typeof mine) => a.reduce((t, x) => t + x.count, 0);
    expect(sum(mine)).toBeLessThanOrEqual(sum(everything));
  });
});

describe("auditoría y exportación", () => {
  it("la auditoría lista cambios con autor y permite filtrar", async () => {
    const manager = await actorByRole("manager");
    const all = await manager.run((db) => listAudit(db, auditQuerySchema.parse({})));
    expect(all.total).toBeGreaterThan(0);
    const changes = await manager.run((db) => listAudit(db, auditQuerySchema.parse({ event: "assignment", pageSize: "10" })));
    expect(changes.rows.every((r) => r.event === "assignment")).toBe(true);
    const advisor = await actorByRole("advisor");
    expect((await advisor.run((db) => listAudit(db, auditQuerySchema.parse({})))).total).toBe(0);
  });

  it("exporta CSV con BOM, tildes y sin inyección de fórmulas", async () => {
    const manager = await actorByRole("manager");
    const lookups = await withUser({ id: manager.session.id, email: manager.session.email }, async (db) => {
      const { loadCatalogs } = await import("@/lib/services/catalogs");
      const { makeLookups } = await import("@/lib/types/catalogs");
      return makeLookups(await loadCatalogs(db));
    });
    const tables = await manager.run((db) => exportLeads(db, { sort: "created_at" }, lookups));
    expect(tables[0].rows.length).toBeGreaterThan(100);
    const csv = toCsv([{ sheet: "t", headers: ["Nombre"], rows: [["=HYPERLINK(\"http://x\")"], ["José Ñandú"]] }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("José Ñandú");
    expect(csv).not.toMatch(/^=HYPERLINK/m);
    expect(csv).toContain("'=HYPERLINK");
    const visits = await (await actorByRole("advisor", 0)).run((db) => exportVisits(db, {}, lookups, null));
    expect(visits[0].headers).toContain("Estado");
    void commercialTables;
    void teamTables;
    void getLookups;
  });
});
