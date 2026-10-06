import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { lookup, type LookupParams } from "@/lib/services/lookup";

export const dynamic = "force-dynamic";

const KINDS = new Set(["lead", "client", "party", "property", "owner"]);

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const kind = sp.get("kind") ?? "";
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  const params: LookupParams = {
    kind: kind as LookupParams["kind"],
    q: sp.get("q")?.slice(0, 80) ?? undefined,
    id: sp.get("id") ?? undefined,
    operation: sp.get("operation") ?? undefined,
    status: sp.get("status") ?? undefined,
  };
  try {
    const items = await withUser({ id: session.id, email: session.email }, (db) => lookup(db, params));
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[lookup]", err);
    return NextResponse.json({ items: [] });
  }
}
