"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { getLead } from "@/lib/services/leads";
import { getClientForEdit } from "@/lib/services/clients";
import { getOwnerForEdit } from "@/lib/services/owners";
import { getVisit } from "@/lib/services/visits";

/** Lecturas puntuales que necesitan los formularios de edición (se cargan al abrir el diálogo). */
export const getLeadForEditAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  handler: async ({ db }, input) => {
    const lead = await getLead(db, input.id);
    if (!lead) throw new Error("not-found");
    return {
      fullName: lead.full_name,
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      source: lead.source,
      priority: lead.priority as "low" | "medium" | "high" | "urgent",
      assignedTo: lead.assigned_to ?? "",
      propertyId: lead.property_id ?? "",
      propertyLabel: lead.property_code ? `${lead.property_code} · ${lead.property_title}` : "",
      message: lead.message ?? "",
      operationType: lead.operation_type ?? "",
      propertyType: lead.property_type ?? "",
      budgetMin: lead.budget_min,
      budgetMax: lead.budget_max,
      currency: lead.currency,
      districts: lead.districts,
      bedroomsMin: lead.bedrooms_min,
      bathroomsMin: lead.bathrooms_min,
      areaMin: lead.area_min,
      areaMax: lead.area_max,
      purchaseDate: lead.purchase_date ?? "",
      financing: lead.financing ?? "",
      interestLevel: lead.interest_level ?? "",
      tagIds: lead.tags.map((t) => t.id),
    };
  },
});

export const getClientForEditAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  handler: async ({ db }, input) => {
    const c = await getClientForEdit(db, input.id);
    if (!c) throw new Error("not-found");
    return c;
  },
});

export const getOwnerForEditAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  handler: async ({ db }, input) => {
    const o = await getOwnerForEdit(db, input.id);
    if (!o) throw new Error("not-found");
    return o;
  },
});

export const getVisitForDialogAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  handler: async ({ db }, input) => {
    const v = await getVisit(db, input.id);
    if (!v) throw new Error("not-found");
    return v;
  },
});
