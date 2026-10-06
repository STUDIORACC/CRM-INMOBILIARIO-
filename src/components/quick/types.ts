import type { ActivityType } from "@/lib/domain/constants";

/** Contexto común: a qué registros se vincula la acción rápida (con etiquetas para mostrar). */
export interface LinkContext {
  leadId?: string;
  leadName?: string;
  clientId?: string;
  clientName?: string;
  opportunityId?: string;
  propertyId?: string;
  propertyLabel?: string;
  ownerId?: string;
  ownerName?: string;
}

export interface DialogMap {
  lead: { leadId?: string } & Partial<LinkContext>;
  client: { clientId?: string; fromLeadId?: string };
  owner: { ownerId?: string };
  opportunity: LinkContext & { operation?: "sale" | "rent" };
  visit: LinkContext & { visitId?: string; reschedule?: boolean };
  "visit-result": { visitId: string; propertyLabel?: string; partyName?: string };
  "visit-cancel": { visitId: string; propertyLabel?: string; partyName?: string };
  task: LinkContext & { task?: Partial<import("@/lib/validation/tasks").TaskInput> & { id: string }; defaultTitle?: string; defaultKind?: string; defaultDueAt?: string };
  activity: LinkContext & { type?: ActivityType };
  assign: { entity: "lead" | "client" | "opportunity" | "property"; ids: string[]; currentUserId?: string | null; label?: string };
  lost: { entity: "lead" | "opportunity"; id: string; name?: string };
  won: { opportunityId: string; name?: string; value?: number; currency?: "PEN" | "USD" };
  whatsapp: {
    phone: string | null;
    name: string;
    leadId?: string;
    clientId?: string;
    opportunityId?: string;
    propertyId?: string;
    propertyLabel?: string;
    visit?: { dateIso: string; address?: string | null; propertyTitle?: string; propertyCode?: string };
    category?: string;
  };
  merge: { leadId: string; leadName: string };
  stage: { opportunityId: string; current: string; name?: string };
  tags: { entity: "lead" | "client"; id: string; current: string[] };
  convert: { leadId: string; leadName: string };
}

export type DialogKind = keyof DialogMap;
export type DialogProps<K extends DialogKind> = { ctx: DialogMap[K]; onClose: () => void };
