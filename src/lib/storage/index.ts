import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDemoMode } from "@/lib/db";

/**
 * Almacenamiento de archivos con dos implementaciones:
 *  - Supabase Storage (producción), con el service role solo en servidor.
 *  - Disco local `.data/uploads` (modo demo).
 * Las imágenes de propiedades se sirven públicas; los documentos siempre pasan por
 * /api/documents/[id], que autoriza con RLS antes de entregar el archivo.
 */
export const BUCKETS = {
  documents: "crm-documents",
  images: "crm-images",
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = MAX_BYTES;

export const ALLOWED_DOC_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

// En Vercel el sistema de archivos del despliegue es de solo lectura: solo /tmp admite escritura (efímero, como la base en memoria)
const localRoot = () =>
  process.env.VERCEL
    ? path.join(os.tmpdir(), "crm-uploads")
    : path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DEMO_UPLOAD_DIR ?? ".data/uploads");

function safeRelative(p: string): string {
  const normalized = path.posix.normalize(p).replace(/^(\.\.(\/|\|$))+/, "");
  if (normalized.startsWith("/") || normalized.includes("..")) throw new Error("Ruta de archivo inválida");
  return normalized;
}

async function supabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para el almacenamiento");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function storagePut(bucket: Bucket, objectPath: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const rel = safeRelative(objectPath);
  if (bytes.byteLength > MAX_BYTES) throw new Error("El archivo supera el máximo de 10 MB");
  if (isDemoMode()) {
    const file = path.join(localRoot(), bucket, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    await fs.writeFile(`${file}.meta`, contentType);
    return;
  }
  const supabase = await supabaseAdmin();
  const { error } = await supabase.storage.from(bucket).upload(rel, bytes, { contentType, upsert: true });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
}

export async function storageGet(bucket: Bucket, objectPath: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const rel = safeRelative(objectPath);
  if (isDemoMode()) {
    const file = path.join(localRoot(), bucket, rel);
    try {
      const [bytes, meta] = await Promise.all([fs.readFile(file), fs.readFile(`${file}.meta`, "utf8").catch(() => "application/octet-stream")]);
      return { bytes, contentType: meta };
    } catch {
      return null;
    }
  }
  const supabase = await supabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).download(rel);
  if (error || !data) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
}

export async function storageDelete(bucket: Bucket, objectPath: string): Promise<void> {
  const rel = safeRelative(objectPath);
  if (isDemoMode()) {
    const file = path.join(localRoot(), bucket, rel);
    await fs.rm(file, { force: true });
    await fs.rm(`${file}.meta`, { force: true });
    return;
  }
  const supabase = await supabaseAdmin();
  await supabase.storage.from(bucket).remove([rel]);
}

/** URL pública de una imagen (galería, logo, avatares). */
export function imagePublicUrl(objectPath: string): string {
  const rel = safeRelative(objectPath);
  if (isDemoMode()) return `/api/media/${BUCKETS.images}/${rel}`;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKETS.images}/${rel}`;
}
