import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { listNotifications, unreadCount } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const actor = { id: session.id, email: session.email };
  if (sp.get("mode") === "count") {
    const unread = await withUser(actor, (db) => unreadCount(db, session.id));
    return NextResponse.json({ unread });
  }
  const limit = Math.min(Number(sp.get("limit") ?? 8) || 8, 50);
  const data = await withUser(actor, (db) => listNotifications(db, session.id, { limit }));
  return NextResponse.json(data);
}
