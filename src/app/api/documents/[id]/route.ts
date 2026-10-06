import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { BUCKETS, storageGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Descarga de documentos: la autorización la decide RLS al leer la fila `documents`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  const doc = await withUser({ id: session.id, email: session.email }, (db) =>
    db.one<{ name: string; storage_path: string; mime_type: string | null }>("select name, storage_path, mime_type from public.documents where id = $1", [id]),
  );
  if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  const file = await storageGet(BUCKETS.documents, doc.storage_path);
  if (!file) return NextResponse.json({ error: "El archivo no está disponible" }, { status: 404 });
  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const safeName = encodeURIComponent(doc.name);
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": doc.mime_type ?? file.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${safeName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
