import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/db";
import { BUCKETS, storageGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Sirve las imágenes subidas en modo demo (en Supabase se usan URLs públicas del bucket). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isDemoMode()) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const [bucket, ...rest] = (await params).path;
  if (bucket !== BUCKETS.images || rest.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const file = await storageGet(BUCKETS.images, rest.join("/"));
  if (!file) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
