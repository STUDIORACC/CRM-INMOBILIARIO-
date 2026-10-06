"use server";

import { defineAction } from "@/lib/actions/safe";
import { can } from "@/lib/domain/permissions";
import { AppError, ForbiddenError } from "@/lib/errors";
import { logSystemEvent, notify } from "@/lib/services/events";
import { assignLeads } from "@/lib/services/leads";
import { assignSchema } from "@/lib/validation/leads";

/** Asigna (o reasigna) leads, clientes, oportunidades o propiedades a un vendedor. */
export const assignEntityAction = defineAction({
  schema: assignSchema,
  handler: async ({ session, db }, input) => {
    const names = new Map((await db.query<{ id: string; full_name: string }>("select id, full_name from public.users")).map((u) => [u.id, u.full_name]));
    const to = names.get(input.userId);
    if (!to) throw new AppError("El usuario seleccionado no existe.");

    if (input.entity === "lead") return assignLeads(db, session, input.ids, input.userId, input.moveOpenWork ?? true);

    if (input.entity === "client") {
      if (!can(session.role, "leads.assign_any")) throw new ForbiddenError("Solo gerencia o asistentes pueden reasignar clientes.");
      const rows = await db.query<{ id: string; full_name: string; assigned_to: string | null }>(
        "update public.clients c set assigned_to = $2 from (select id, assigned_to as prev from public.clients where id = any($1::uuid[])) o where c.id = o.id returning c.id, c.full_name, o.prev as assigned_to",
        [input.ids, input.userId],
      );
      for (const r of rows) {
        await logSystemEvent(db, { event: "assigned", userId: session.id, clientId: r.id, meta: { from: r.assigned_to ? names.get(r.assigned_to) : null, to }, metadata: { to: input.userId } });
        await notify(db, { userId: input.userId, actorId: session.id, type: "client_new", title: `Cliente asignado: ${r.full_name}`, href: `/clients/${r.id}`, entityType: "client", entityId: r.id, dedupeKey: `client_assigned:${r.id}:${input.userId}` });
      }
      return rows.length;
    }

    if (input.entity === "opportunity") {
      if (!can(session.role, "opportunities.reassign")) throw new ForbiddenError("Solo gerencia puede reasignar oportunidades.");
      const rows = await db.query<{ id: string; lead_id: string | null; client_id: string | null; property_id: string; prev: string }>(
        `update public.opportunities o set assigned_to = $2 from (select id, assigned_to as prev from public.opportunities where id = any($1::uuid[])) x
          where o.id = x.id returning o.id, o.lead_id, o.client_id, o.property_id, x.prev`,
        [input.ids, input.userId],
      );
      for (const r of rows) {
        await db.query("update public.tasks set assigned_to = $2 where opportunity_id = $1 and assigned_to = $3 and status in ('pending', 'in_progress')", [r.id, input.userId, r.prev]);
        await logSystemEvent(db, { event: "assigned", userId: session.id, opportunityId: r.id, leadId: r.lead_id, clientId: r.client_id, propertyId: r.property_id, meta: { from: names.get(r.prev), to }, metadata: { to: input.userId } });
        await notify(db, { userId: input.userId, actorId: session.id, type: "opportunity_new", title: "Se te asignó una oportunidad", href: `/opportunities/${r.id}`, entityType: "opportunity", entityId: r.id, dedupeKey: `opp_assigned:${r.id}:${input.userId}` });
      }
      return rows.length;
    }

    // property
    if (!can(session.role, "properties.edit_any")) throw new ForbiddenError("Solo gerencia puede reasignar el asesor de una propiedad.");
    const rows = await db.query<{ id: string }>("update public.properties set advisor_id = $2 where id = any($1::uuid[]) returning id", [input.ids, input.userId]);
    for (const r of rows) await logSystemEvent(db, { event: "assigned", userId: session.id, propertyId: r.id, meta: { to }, metadata: { to: input.userId } });
    return rows.length;
  },
  successMessage: (n) => (n === 1 ? "Asignación guardada" : `${n} registros asignados`),
});

