import type { Metadata } from "next";
import { Info } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isDemoMode, withAdmin } from "@/lib/db";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

/** Fotografía real de arquitectura (CDN de Unsplash, la misma fuente de las fotos de propiedades). Si no carga, queda el azul sólido. */
const LOGIN_PHOTO = "https://images.unsplash.com/photo-1448630360428-65456885c650?auto=format&fit=crop&w=1400&q=70";

const FEATURES = [
  "Pipeline y métricas por vendedor, siempre al día",
  "Clientes y propiedades que se cruzan solos según lo que buscan",
  "Visitas, tareas y seguimientos que nunca se olvidan",
  "Cada vendedor ve lo suyo; la gerencia ve todo el negocio",
];

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
      <aside className="relative hidden overflow-hidden bg-[#0e1a33] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGIN_PHOTO} alt="" className="absolute inset-0 size-full object-cover" />
        {/* Velo oscuro plano: oscurece arriba y abajo para que el texto se lea sobre la foto */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(8,15,32,0.78)_0%,rgba(8,15,32,0.5)_30%,rgba(8,15,32,0.72)_55%,rgba(8,15,32,0.92)_100%)]" />
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
          <p className="mt-4 text-base text-white/80">Leads, propiedades, visitas y seguimiento comercial conectados. Nada se pierde entre WhatsApp, Excel y notas sueltas.</p>
          <ul className="mt-9 divide-y divide-white/20 border-y border-white/20 text-sm text-white/90">
            {FEATURES.map((text) => (
              <li key={text} className="py-3">
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-white/60">© {new Date().getFullYear()} {brand.name}. Todos los derechos reservados.</div>
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
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>
                Estás en el <b className="text-foreground">modo demostración</b>: base de datos embebida con datos ficticios. Elige un perfil para explorar los permisos de cada rol.
              </span>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
