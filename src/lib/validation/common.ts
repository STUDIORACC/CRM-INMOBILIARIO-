import { z } from "zod";

/** UUID o cadena vacía (campos de formulario opcionales). */
export const optionalUuid = z.union([z.string().uuid("Valor inválido"), z.literal("")]).optional();
export const requiredUuid = (message: string) => z.string().min(1, message).uuid(message);

export const optionalText = (max = 1000) => z.string().trim().max(max, `Máximo ${max} caracteres`).optional();

/** Número no negativo o null (los NumberField guardan number | null). */
export const optionalAmount = z.number({ error: "Ingresa un número válido" }).min(0, "No puede ser negativo").max(1_000_000_000, "Valor demasiado alto").nullable().optional();
export const optionalInt = (min = 0, max = 100) => z.number({ error: "Ingresa un número entero" }).int("Debe ser un número entero").min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`).nullable().optional();

export const dateTimeLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Ingresa una fecha y hora válidas");
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha válida");
export const optionalDate = z.union([dateOnly, z.literal("")]).optional();

export const priorityEnum = z.enum(["low", "medium", "high", "urgent"], { error: "Selecciona una prioridad" });
export const currencyEnum = z.enum(["PEN", "USD"], { error: "Selecciona una moneda" });

/** '' / undefined -> null */
export const nn = <T>(v: T | "" | undefined | null): T | null => (v === "" || v === undefined || v === null ? null : v);

export const idSchema = z.object({ id: z.string().uuid() });
