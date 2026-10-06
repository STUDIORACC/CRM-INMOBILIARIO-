import { z } from "zod";
import { MANUAL_ACTIVITY_TYPES } from "@/lib/domain/constants";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);
const uuid = z.string().uuid().optional().catch(undefined);

const ACTIVITY_FILTER_TYPES = [...MANUAL_ACTIVITY_TYPES, "visit", "task", "system"] as const;

/** Feed de actividad comercial del equipo (/activities). */
export const activityFeedQuerySchema = z.object({
  tab: z.enum(["activity", "audit"]).catch("activity"),
  q: z.string().trim().max(80).optional().catch(undefined),
  type: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((t): t is (typeof ACTIVITY_FILTER_TYPES)[number] => (ACTIVITY_FILTER_TYPES as readonly string[]).includes(t)) : []))
    .catch([]),
  user: uuid,
  from: date,
  to: date,
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(30),
});
export type ActivityFeedQuery = z.infer<typeof activityFeedQuerySchema>;

/** Registro de auditoría (solo administración y gerencia). */
export const auditQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  entity: z.string().max(40).optional().catch(undefined),
  event: z.string().max(40).optional().catch(undefined),
  user: uuid,
  from: date,
  to: date,
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(30),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
