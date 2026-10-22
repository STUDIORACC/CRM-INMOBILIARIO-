import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const at = new Date().toISOString();
  if (new URL(req.url).searchParams.get("deep") !== "1") return NextResponse.json({ ok: true, at });
  // TEMPORAL: diagnóstico de la base de demo en Vercel
  try {
    const t = Date.now();
    const n = await withAdmin((db) => db.scalar<number>("select count(*)::int from public.leads"));
    return NextResponse.json({ ok: true, at, leads: n, ms: Date.now() - t });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ ok: false, at, name: err.name, message: err.message, stack: err.stack?.split("\n").slice(0, 8) }, { status: 500 });
  }
}
