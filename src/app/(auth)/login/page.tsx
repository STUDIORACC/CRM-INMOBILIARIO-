import type { Metadata } from "next";
import { Building2, CalendarCheck, LineChart, ShieldCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isDemoMode, withAdmin } from "@/lib/db";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

const DEMO_ACCOUNTS = [
  { role: "Administradora", name: "Patricia Villanueva", email: "patricia.villanueva@altura.example" },
  { role: "Gerente comercial", name: "Ricardo Paredes", email: "ricardo.paredes@altura.example" },
  { role: "Asesor", name: "José López", email: "jose.lopez@altura.example" },
  { role: "Asistente", name: "Daniela Quispe", email: "daniela.quispe@altura.example" },
];

async function getBranding() {
  try {
    const row = await withAdmin((db) => db.one<{ name: string; logo_url: string | null }>("select name, logo_url from public.company_settings where id = 1"));
    return { name: row?.name ?? "CRM Inmobiliario", logo: row?.logo_url ?? null };
  } catch {
    return { name: "CRM Inmobiliario", logo: null };
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Con una sesión válida no tiene sentido mostrar el login (una cookie obsoleta sí lo muestra)
  if (await getSession()) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  const brand = await getBranding();
  const demo = isDemoMode();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca */}
      <aside className="relative hidden overflow-hidden bg-[oklch(0.28_0.09_265)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-32 -right-24 size-[26rem] rounded-full bg-[oklch(0.55_0.2_262)]/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-[oklch(0.62_0.16_200)]/25 blur-3xl" />
        <div className="relative flex items-center gap-3">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt="" className="size-10 rounded-xl" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">{brand.name.slice(0, 1)}</div>
          )}
          <div className="text-lg font-semibold tracking-tight">{brand.name}</div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl leading-[1.15] font-semibold tracking-tight text-balance">Toda tu operación inmobiliaria, ordenada en un solo lugar.</h1>
          <p className="mt-4 text-base text-white/70">Leads, propiedades, visitas y seguimiento comercial conectados. Nada se pierde entre WhatsApp, Excel y notas sueltas.</p>
          <ul className="mt-8 space-y-4 text-sm text-white/85">
            {[
              [LineChart, "Pipeline y métricas en tiempo real por vendedor"],
              [Building2, "Matching automático entre clientes y propiedades"],
              [CalendarCheck, "Visitas, tareas y seguimientos que nunca se olvidan"],
              [ShieldCheck, "Permisos por rol y datos protegidos con RLS"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof LineChart;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                    <I className="size-4" />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="relative text-xs text-white/50">© {new Date().getFullYear()} {brand.name}. Todos los derechos reservados.</div>
      </aside>

      {/* Formulario */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt="" className="size-10 rounded-xl" />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">{brand.name.slice(0, 1)}</div>
            )}
            <div className="text-lg font-semibold">{brand.name}</div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Inicia sesión</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Ingresa con tu correo corporativo para continuar.</p>

          <LoginForm next={next} demoAccounts={demo ? DEMO_ACCOUNTS : []} />

          {demo && (
            <p className="mt-6 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
              Estás en el <b className="text-foreground">modo demostración</b>: base de datos embebida con datos ficticios. Elige un perfil para explorar los permisos de cada rol.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
