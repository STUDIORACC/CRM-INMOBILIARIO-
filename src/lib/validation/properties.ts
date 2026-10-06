import { z } from "zod";
import { currencyEnum, optionalAmount, optionalInt, optionalText, optionalUuid } from "./common";

export const PROPERTY_STATUS_VALUES = ["available", "reserved", "sold", "rented", "paused", "withdrawn"] as const;
export const PUBLICATION_VALUES = ["published", "pending", "paused", "withdrawn"] as const;

const coord = (min: number, max: number, label: string) =>
  z.number({ error: `${label} inválida` }).min(min, `${label} fuera de rango`).max(max, `${label} fuera de rango`).nullable().optional();

export const propertySchema = z
  .object({
    code: z
      .string()
      .trim()
      .max(20)
      .regex(/^[A-Za-z0-9-]*$/, "Solo letras, números y guiones")
      .optional(),
    title: z.string().trim().min(3, "Escribe un título (mín. 3 caracteres)").max(140, "Máximo 140 caracteres"),
    description: optionalText(3000),
    propertyType: z.string().min(1, "Selecciona el tipo de inmueble"),
    operation: z.enum(["sale", "rent"], { error: "Selecciona el tipo de operación" }),
    price: z.number({ error: "Ingresa el precio" }).min(1, "El precio debe ser mayor a 0").max(1_000_000_000).nullable(),
    currency: currencyEnum,
    minPrice: optionalAmount,
    commissionPct: z.number().min(0, "Mínimo 0%").max(100, "Máximo 100%").nullable().optional(),
    district: z.string().min(1, "Selecciona el distrito"),
    province: z.string().trim().min(1).max(60),
    address: optionalText(200),
    reference: optionalText(200),
    latitude: coord(-90, 90, "Latitud"),
    longitude: coord(-180, 180, "Longitud"),
    totalArea: optionalAmount,
    builtArea: optionalAmount,
    bedrooms: optionalInt(0, 30),
    bathrooms: optionalInt(0, 30),
    parking: optionalInt(0, 30),
    ageYears: optionalInt(0, 200),
    floor: z.number().int("Debe ser un entero").min(-5).max(100).nullable().optional(),
    elevator: z.boolean(),
    furnished: z.boolean(),
    features: z.array(z.string()).max(30),
    status: z.enum(PROPERTY_STATUS_VALUES),
    publicationStatus: z.enum(PUBLICATION_VALUES),
    ownerId: optionalUuid,
    advisorId: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (v.price == null) ctx.addIssue({ code: "custom", path: ["price"], message: "Ingresa el precio" });
    if (v.minPrice != null && v.price != null && v.minPrice > v.price) ctx.addIssue({ code: "custom", path: ["minPrice"], message: "El precio mínimo no puede superar al precio de lista" });
    if ((v.latitude == null) !== (v.longitude == null)) ctx.addIssue({ code: "custom", path: ["longitude"], message: "Ingresa latitud y longitud juntas" });
  });
export type PropertyInput = z.infer<typeof propertySchema>;

export const statusChangeSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(PROPERTY_STATUS_VALUES).optional(),
  publicationStatus: z.enum(PUBLICATION_VALUES).optional(),
});

export const priceChangeSchema = z.object({ id: z.string().uuid(), price: z.number().min(1).max(1_000_000_000), minPrice: optionalAmount });

export const imageUrlSchema = z.object({
  propertyId: z.string().uuid(),
  url: z.string().trim().url("Ingresa una URL válida").max(1000),
  caption: optionalText(120),
});

const multi = z
  .string()
  .optional()
  .catch(undefined)
  .transform((v) => (v ? v.split(",").filter(Boolean) : []));

export const propertyListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  status: multi,
  publication: multi,
  operation: z.string().optional().catch(undefined),
  type: z.string().optional().catch(undefined),
  district: z.string().optional().catch(undefined),
  advisor: z.string().optional().catch(undefined),
  owner: z.string().optional().catch(undefined),
  priceMin: z.coerce.number().min(0).optional().catch(undefined),
  priceMax: z.coerce.number().min(0).optional().catch(undefined),
  bedrooms: z.coerce.number().int().min(0).optional().catch(undefined),
  quiet: z.string().optional().catch(undefined),
  view: z.enum(["grid", "table"]).catch("grid"),
  sort: z.enum(["updated_at", "created_at", "price", "code", "district", "total_area"]).catch("updated_at"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(6).max(100).catch(24),
});
export type PropertyListQuery = z.infer<typeof propertyListQuerySchema>;
