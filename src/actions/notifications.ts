"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { deleteNotifications, markNotificationsRead } from "@/lib/services/notifications";

const readSchema = z.object({ ids: z.array(z.string().uuid()).optional(), all: z.boolean().optional() });

export const markNotificationsReadAction = defineAction({
  schema: readSchema,
  revalidate: ["/notifications"],
  handler: ({ session, db }, input) => markNotificationsRead(db, session.id, input),
});

export const deleteNotificationsAction = defineAction({
  schema: z.object({ ids: z.array(z.string().uuid()).min(1) }),
  revalidate: ["/notifications"],
  successMessage: "Notificaciones eliminadas",
  handler: async ({ session, db }, input) => {
    await deleteNotifications(db, session.id, input.ids);
  },
});
