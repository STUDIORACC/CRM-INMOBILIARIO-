import { z } from "zod";
import { dateOnly, optionalText, optionalUuid } from "./common";
import { optEnum, refineProfile, searchProfileShape } from "./leads";

const phoneField = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || (v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15), "Ingresa un teléfono válido (7 a 15 dígitos)")
  .optional();
const emailField = z
  .string()
  .trim()
  .max(120)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Correo electrónico inválido")
  .optional();

export const DOC_TYPE_VALUES = ["dni", "ruc", "ce", "passport"] as const;

export const clientSchema = z
  .object({
    fullName: z.string().trim().min(2, "Ingresa el nombre del cliente").max(120, "Máximo 120 caracteres"),
    docType: optEnum(DOC_TYPE_VALUES),
    docNumber: z.string().trim().max(20, "Máximo 20 caracteres").optional(),
    phone: phoneField,
    email: emailField,
    address: optionalText(200),
    source: optionalText(40),
    assignedTo: optionalUuid,
    searchNotes: optionalText(1000),
    purchaseDate: z.union([dateOnly, z.literal("")]).optional(),
    tagIds: z.array(z.string().uuid()).max(12),
    ...searchProfileShape,
  })
  .superRefine((v, ctx) => {
    if (!(v.phone ?? "").trim() && !(v.email ?? "").trim()) ctx.addIssue({ code: "custom", path: ["phone"], message: "Ingresa un teléfono o un correo" });
    if (v.docType === "dni" && v.docNumber && !/^\d{8}$/.test(v.docNumber)) ctx.addIssue({ code: "custom", path: ["docNumber"], message: "El DNI tiene 8 dígitos" });
    if (v.docType === "ruc" && v.docNumber && !/^\d{11}$/.test(v.docNumber)) ctx.addIssue({ code: "custom", path: ["docNumber"], message: "El RUC tiene 11 dígitos" });
    refineProfile(v, ctx);
  });
export type ClientInput = z.infer<typeof clientSchema>;

export const createClientSchema = z.object({ client: clientSchema, duplicateMode: z.union([z.literal("check"), z.literal("create")]).default("check") });

const multi = z
  .string()
  .optional()
  .catch(undefined)
  .transform((v) => (v ? v.split(",").filter(Boolean) : []));

export const clientListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  assigned: z.string().optional().catch(undefined),
  tag: multi,
  district: z.string().optional().catch(undefined),
  operation: z.string().optional().catch(undefined),
  idle: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  sort: z.enum(["created_at", "full_name", "last_activity_at", "budget_max"]).catch("created_at"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(20),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export const ownerSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa el nombre o razón social").max(140, "Máximo 140 caracteres"),
  docType: optEnum(DOC_TYPE_VALUES),
  docNumber: z.string().trim().max(20, "Máximo 20 caracteres").optional(),
  phone: phoneField,
  email: emailField,
  address: optionalText(200),
  ownerType: z.enum(["individual", "company", "joint"], { error: "Selecciona el tipo de propietario" }),
  notes: optionalText(1000),
});
export type OwnerInput = z.infer<typeof ownerSchema>;

export const ownerListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  type: z.string().optional().catch(undefined),
  sort: z.enum(["full_name", "created_at", "properties"]).catch("full_name"),
  dir: z.enum(["asc", "desc"]).catch("asc"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(20),
});
export type OwnerListQuery = z.infer<typeof ownerListQuerySchema>;
