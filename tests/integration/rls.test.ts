import { describe, expect, it } from "vitest";
import { notify } from "@/lib/services/events";
import { admin, actorByRole, count, makeActor } from "./helpers";

describe("seguridad a nivel de fila (RLS)", () => {
  it("un asesor ve solo sus leads y los que no tienen responsable", async () => {
    const advisor = await actorByRole("advisor", 0);
    const visible = await advisor.run((db) => count(db, "select count(*) from public.leads"));
    const expected = await admin((db) => count(db, "select count(*) from public.leads where assigned_to = $1 or assigned_to is null", [advisor.session.id]));
    const total = await admin((db) => count(db, "select count(*) from public.leads"));
    expect(visible).toBe(expected);
    expect(visible).toBeLessThan(total);
    const foreign = await advisor.run((db) => count(db, "select count(*) from public.leads where assigned_to is not null and assigned_to <> $1", [advisor.session.id]));
    expect(foreign).toBe(0);
  });

  it("un asesor solo ve sus oportunidades y visitas", async () => {
    const advisor = await actorByRole("advisor", 1);
    const foreignOpps = await advisor.run((db) => count(db, "select count(*) from public.opportunities where assigned_to <> $1", [advisor.session.id]));
    const foreignVisits = await advisor.run((db) => count(db, "select count(*) from public.visits where advisor_id <> $1", [advisor.session.id]));
    expect(foreignOpps).toBe(0);
    expect(foreignVisits).toBe(0);
    expect(await advisor.run((db) => count(db, "select count(*) from public.opportunities"))).toBeGreaterThan(0);
  });

  it("la gerencia ve todo el pipeline", async () => {
    const manager = await actorByRole("manager");
    const all = await admin((db) => count(db, "select count(*) from public.opportunities"));
    expect(await manager.run((db) => count(db, "select count(*) from public.opportunities"))).toBe(all);
  });

  it("el asistente no accede a oportunidades ni propietarios", async () => {
    const assistant = await actorByRole("assistant");
    expect(await assistant.run((db) => count(db, "select count(*) from public.opportunities"))).toBe(0);
    expect(await assistant.run((db) => count(db, "select count(*) from public.owners"))).toBe(0);
    // pero sí gestiona leads
    expect(await assistant.run((db) => count(db, "select count(*) from public.leads"))).toBeGreaterThan(0);
  });

  it("un asesor no puede modificar la configuración de la empresa", async () => {
    const advisor = await actorByRole("advisor");
    const res = await advisor.run((db) => db.query("update public.company_settings set name = 'Hackeado' where id = 1 returning id"));
    expect(res).toHaveLength(0);
    const name = await admin((db) => db.scalar<string>("select name from public.company_settings where id = 1"));
    expect(name).not.toBe("Hackeado");
  });

  it("el administrador sí puede editar la configuración", async () => {
    const adminUser = await actorByRole("admin");
    const res = await adminUser.run((db) => db.query("update public.company_settings set website = website returning id"));
    expect(res).toHaveLength(1);
  });

  it("la auditoría solo la leen administración y gerencia", async () => {
    const total = await admin((db) => count(db, "select count(*) from public.audit_logs"));
    expect(total).toBeGreaterThan(0);
    expect(await (await actorByRole("manager")).run((db) => count(db, "select count(*) from public.audit_logs"))).toBe(total);
    expect(await (await actorByRole("advisor")).run((db) => count(db, "select count(*) from public.audit_logs"))).toBe(0);
    expect(await (await actorByRole("assistant")).run((db) => count(db, "select count(*) from public.audit_logs"))).toBe(0);
  });

  it("el registro de auditoría no se puede alterar ni borrar", async () => {
    const manager = await actorByRole("manager");
    // El rol de la app ni siquiera tiene privilegios de UPDATE/DELETE sobre la bitácora
    await expect(manager.run((db) => db.query("update public.audit_logs set event = 'x' returning id"))).rejects.toThrow(/permission denied/);
    await expect(manager.run((db) => db.query("delete from public.audit_logs returning id"))).rejects.toThrow(/permission denied/);
    await expect(manager.run((db) => db.query("insert into public.audit_logs (entity_type, action, event) values ('leads', 'create', 'create')"))).rejects.toThrow(/permission denied|row-level security/);
  });

  it("un asesor no puede reasignar un lead ajeno ni borrarlo", async () => {
    const advisor = await actorByRole("advisor", 0);
    const other = await admin((db) => db.one<{ id: string }>("select id from public.leads where assigned_to is not null and assigned_to <> $1 limit 1", [advisor.session.id]));
    const res = await advisor.run((db) => db.query("update public.leads set assigned_to = $2 where id = $1 returning id", [other!.id, advisor.session.id]));
    expect(res).toHaveLength(0);
    const del = await advisor.run((db) => db.query("delete from public.leads where id = $1 returning id", [other!.id]));
    expect(del).toHaveLength(0);
  });

  it("cada usuario ve solo sus notificaciones", async () => {
    const a = await actorByRole("advisor", 0);
    const mine = await a.run((db) => count(db, "select count(*) from public.notifications"));
    const own = await admin((db) => count(db, "select count(*) from public.notifications where user_id = $1", [a.session.id]));
    expect(mine).toBe(own);
  });

  it("una cuenta autenticada que no es personal activo no ve ni escribe nada", async () => {
    const stranger = makeActor({ id: "99999999-9999-4999-8999-999999999999", email: "externo@example.com", fullName: "Cuenta sin perfil", role: "advisor", avatarUrl: null, phone: null });
    for (const table of ["leads", "clients", "properties", "owners", "opportunities", "visits", "tasks", "activities", "notes", "company_settings", "users"]) {
      expect(await stranger.run((db) => count(db, `select count(*) from public.${table}`)), table).toBe(0);
    }
    await expect(stranger.run((db) => db.query("insert into public.leads (full_name, phone, source) values ('X', '955000999', 'web')"))).rejects.toThrow(/row-level security/);
  });

  it("un usuario puede notificar a otro mediante push_notification (y respeta la deduplicación)", async () => {
    const manager = await actorByRole("manager");
    const advisor = await actorByRole("advisor", 2);
    const key = `test:${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      await manager.run((db) => notify(db, { userId: advisor.session.id, actorId: manager.session.id, type: "lead_assigned", title: "Aviso de prueba", dedupeKey: key }));
    }
    const rows = await advisor.run((db) => count(db, "select count(*) from public.notifications where dedupe_key = $1", [key]));
    expect(rows).toBe(1);
  });

  it("un asesor no puede insertar notificaciones directamente para otros", async () => {
    const advisor = await actorByRole("advisor", 0);
    const other = await actorByRole("advisor", 1);
    await expect(advisor.run((db) => db.query("insert into public.notifications (user_id, type, title, dedupe_key) values ($1, 'x', 'directo', 'k1') on conflict (user_id, dedupe_key) do nothing", [other.session.id]))).rejects.toThrow(/row-level security/);
  });
});
