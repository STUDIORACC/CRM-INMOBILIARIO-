import { NextResponse, type NextRequest } from "next/server";
import { withAdmin } from "@/lib/db";
import { syncAlertNotifications } from "@/lib/services/alerts";

export const dynamic = "force-dynamic";

/**
 * Genera notificaciones por tiempo (tareas vencidas, visitas próximas, oportunidades estancadas).
 * Programar en Vercel Cron (vercel.json) con el encabezado Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const created = await withAdmin((db) => syncAlertNotifications(db, { force: true }));
  return NextResponse.json({ ok: true, created });
}
