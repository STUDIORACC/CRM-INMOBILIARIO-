"use server";

import { z } from "zod";
import { defineAction } from "@/lib/actions/safe";
import { addDays } from "date-fns";
import { createTask, deleteTask, rescheduleTask, setTaskStatus, updateTask } from "@/lib/services/tasks";
import { taskSchema, taskStatusSchema } from "@/lib/validation/tasks";

export const createTaskAction = defineAction({
  schema: taskSchema,
  successMessage: "Tarea creada",
  handler: async ({ session, db }, input) => {
    const res = await createTask(db, session, input);
    return res;
  },
});

export const updateTaskAction = defineAction({
  schema: taskSchema.extend({ id: z.string().uuid() }),
  successMessage: "Tarea actualizada",
  handler: async ({ db }, input) => {
    await updateTask(db, input);
  },
});

export const setTaskStatusAction = defineAction({
  schema: taskStatusSchema,
  handler: async ({ session, db }, input) => {
    await setTaskStatus(db, session, input.id, input.status);
    return { status: input.status };
  },
  successMessage: (r) => (r.status === "completed" ? "Tarea completada" : "Tarea actualizada"),
});

export const postponeTaskAction = defineAction({
  schema: z.object({ id: z.string().uuid(), days: z.number().int().min(1).max(30).default(1) }),
  successMessage: "Tarea reprogramada",
  handler: async ({ db }, input) => {
    const row = await db.one<{ due_at: string }>("select due_at from public.tasks where id = $1", [input.id]);
    const base = row ? new Date(row.due_at) : new Date();
    const from = base.getTime() < Date.now() ? new Date() : base;
    await rescheduleTask(db, input.id, addDays(from, input.days).toISOString());
  },
});

export const deleteTaskAction = defineAction({
  schema: z.object({ id: z.string().uuid() }),
  successMessage: "Tarea eliminada",
  handler: async ({ db }, input) => {
    await deleteTask(db, input.id);
  },
});
