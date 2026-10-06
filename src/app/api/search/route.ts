import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { globalSearch } from "@/lib/services/search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const hits = await withUser({ id: session.id, email: session.email }, (db) => globalSearch(db, q));
    return NextResponse.json({ hits });
  } catch (err) {
    console.error("[search]", err);
    return NextResponse.json({ hits: [] });
  }
}
