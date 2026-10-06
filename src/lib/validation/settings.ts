import { z } from "zod";
import { TEMPLATE_VARIABLES } from "@/lib/domain/constants";
import { optionalText } from "./common";

const phone = z.string().trim().max(30, "Máximo 30 caracteres").optional();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido");

// --- Perfil y contraseña --------------------------------------------------------
export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa tu nombre completo").max(120, "Máximo 120 caracteres"),
  phone,
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const passwordRules = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(72, "Máximo 72 caracteres")
  .regex(/[A-Za-z]/, "Incluye al menos una letra")
  .regex(/\d/, "Incluye al menos un número");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
    newPassword: passwordRules,
    confirm: z.string().min(1, "Confirma la nueva contraseña"),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Debe ser distinta de la actual" });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// --- Empresa --------------------------------------------------------------------
export const companySchema = z.object({
  name: z.string().trim().min(2, "Ingresa el nombre comercial").max(120),
  legalName: optionalText(160),
  taxId: z.string().trim().max(20).optional(),
  phone,
  email: z.union([z.string().trim().email("Correo inválido"), z.literal("")]).optional(),
  address: optionalText(200),
  website: optionalText(120),
  currency: z.enum(["PEN", "USD"], { error: "Selecciona la moneda" }),
  usdRate: z.number({ error: "Ingresa un tipo de cambio válido" }).min(0.1, "Debe ser mayor a 0").max(100, "Valor demasiado alto"),
});
export type CompanyInput = z.infer<typeof companySchema>;

// --- Catálogos --------------------------------------------------------------------
export const CATALOG_NAMES = ["lead_source", "loss_reason", "property_type", "district"] as const;
export type CatalogName = (typeof CATALOG_NAMES)[number];

export const catalogItemSchema = z.object({
  id: z.string().uuid().optional(),
  catalog: z.enum(CATALOG_NAMES),
  label: z.string().trim().min(2, "Mínimo 2 caracteres").max(60, "Máximo 60 caracteres"),
  color: z.union([color, z.literal("")]).optional(),
  active: z.boolean().default(true),
});
export type CatalogItemInput = z.input<typeof catalogItemSchema>;

export const stageSchema = z.object({
  key: z.string().min(1),
  label: z.string().trim().min(2, "Mínimo 2 caracteres").max(40, "Máximo 40 caracteres"),
  defaultProbability: z.coerce.number().int().refine((n) => [0, 10, 25, 50, 75, 90, 100].includes(n), "Probabilidad no permitida"),
  color,
});
export type StageInput = z.infer<typeof stageSchema>;

// --- Notificaciones y alertas -----------------------------------------------------
export const NOTIFY_KEYS = [
  "new_lead_assigned",
  "follow_up_overdue",
  "task_overdue",
  "visit_upcoming",
  "visit_cancelled",
  "opportunity_stalled",
  "opportunity_new",
  "property_reserved",
  "new_client",
] as const;

const days = (label: string, max: number) => z.number({ error: `Ingresa ${label}` }).int("Debe ser un número entero").min(1, "Mínimo 1").max(max, `Máximo ${max}`);

export const notifySchema = z.object({
  alertLeadIdleDays: days("los días sin actividad de un lead", 90),
  alertOpportunityDays: days("los días sin movimiento de una oportunidad", 90),
  alertClientIdleDays: days("los días sin contacto de un cliente", 365),
  alertFirstResponseH: days("las horas para el primer contacto", 72),
  notify: z.record(z.string(), z.boolean()),
});
export type NotifyInput = z.infer<typeof notifySchema>;

// --- Plantillas --------------------------------------------------------------------
const knownVars = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
export const templateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(3, "Mínimo 3 caracteres").max(80, "Máximo 80 caracteres"),
  channel: z.enum(["whatsapp", "email"]),
  category: z.string().trim().min(2, "Selecciona una categoría").max(40),
  subject: optionalText(150),
  body: z
    .string()
    .trim()
    .min(10, "Escribe el mensaje (mínimo 10 caracteres)")
    .max(1500, "Máximo 1500 caracteres")
    .superRefine((v, ctx) => {
      const bad = [...v.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !knownVars.has(k));
      if (bad.length) ctx.addIssue({ code: "custom", message: `Variable desconocida: {{${bad[0]}}}` });
    }),
  active: z.boolean().default(true),
});
export type TemplateInput = z.input<typeof templateSchema>;

// --- Usuarios -------------------------------------------------------------------
export const userCreateSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa el nombre completo").max(120),
  email: z.string().trim().toLowerCase().min(1, "Ingresa el correo").email("Correo electrónico inválido"),
  phone,
  role: z.enum(["admin", "manager", "advisor", "assistant"], { error: "Selecciona un rol" }),
  password: passwordRules,
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(2, "Ingresa el nombre completo").max(120),
  phone,
  role: z.enum(["admin", "manager", "advisor", "assistant"], { error: "Selecciona un rol" }),
  status: z.enum(["active", "inactive"]),
  /** Al desactivar: traspasa el trabajo abierto a este usuario. */
  reassignTo: z.union([z.string().uuid(), z.literal("")]).optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const resetPasswordSchema = z.object({ id: z.string().uuid(), password: passwordRules });
