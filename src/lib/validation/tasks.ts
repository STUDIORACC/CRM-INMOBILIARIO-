import { z } from "zod";
import { dateTimeLocal, optionalText, optionalUuid, priorityEnum, requiredUuid } from "./common";

export const TASK_KIND_VALUES = ["call", "whatsapp", "meeting", "visit", "send_properties", "follow_up", "document", "other"] as const;

export const taskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3, "Escribe al menos 3 caracteres").max(160, "Máximo 160 caracteres"),
  description: optionalText(1000),
  kind: z.enum(TASK_KIND_VALUES, { error: "Selecciona el tipo de tarea" }),
  assignedTo: requiredUuid("Selecciona un responsable"),
  priority: priorityEnum,
  dueAt: dateTimeLocal,
  leadId: optionalUuid,
  clientId: optionalUuid,
  opportunityId: optionalUuid,
  propertyId: optionalUuid,
});
export type TaskInput = z.infer<typeof taskSchema>;

export const taskStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
});

export const taskListQuerySchema = z.object({
  tab: z.enum(["today", "upcoming", "overdue", "completed", "all"]).catch("today"),
  q: z.string().trim().max(80).optional().catch(undefined),
  user: z.union([z.string().uuid(), z.literal("all")]).optional().catch(undefined),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().catch(undefined),
  kind: z.enum(TASK_KIND_VALUES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(30),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
