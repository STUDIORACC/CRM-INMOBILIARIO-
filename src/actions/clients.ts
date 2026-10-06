"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { createClient, deleteClient, setClientStatus, updateClient } from "@/lib/services/clients";
import { createOwner, deleteOwner, updateOwner } from "@/lib/services/owners";
import { clientSchema, createClientSchema, ownerSchema } from "@/lib/validation/clients";

export const createClientAction = defineAction({
  schema: createClientSchema,
  successMessage: "Cliente creado",
  handler: async ({ session, db }, input) => createClient(db, session, input.client, input.duplicateMode),
});

export const updateClientAction = defineAction({
  schema: z.object({ id: z.string().uuid(), client: clientSchema }),
  successMessage: "Cliente actualizado",
  handler: async ({ session, db }, input) => {
    await updateClient(db, session, input.id, input.client);
  },
});

export const deleteClientAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  capability: "clients.delete",
  successMessage: "Cliente eliminado",
  handler: async ({ db }, input) => {
    await deleteClient(db, input.id);
  },
});

export const setClientStatusAction = defineAction({
  schema: z.object({ id: z.string().uuid(), status: z.enum(["active", "inactive"]) }),
  successMessage: "Estado actualizado",
  handler: async ({ db }, input) => {
    await setClientStatus(db, input.id, input.status);
  },
});

export const createOwnerAction = defineAction({
  schema: ownerSchema,
  capability: "owners.access",
  successMessage: "Propietario creado",
  handler: async ({ session, db }, input) => createOwner(db, session, input),
});

export const updateOwnerAction = defineAction({
  schema: z.object({ id: z.string().uuid(), owner: ownerSchema }),
  capability: "owners.access",
  successMessage: "Propietario actualizado",
  handler: async ({ db }, input) => {
    await updateOwner(db, input.id, input.owner);
  },
});

export const deleteOwnerAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  capability: "owners.delete",
  successMessage: "Propietario eliminado",
  handler: async ({ db }, input) => {
    await deleteOwner(db, input.id);
  },
});
