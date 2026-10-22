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

/** Contacto para solicitar acceso a la demo (se puede cambiar con NEXT_PUBLIC_DEMO_WHATSAPP, solo dígitos con código de país). */
const DEMO_WHATSAPP = process.env.NEXT_PUBLIC_DEMO_WHATSAPP?.replace(/D/g, "") || "51942369162";
const DEMO_WHATSAPP_MESSAGE = "Hola, vengo de la página de demostración del CRM. Me gustaría agendar una cita para ver la página y necesito las credenciales de acceso.";

function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.8h-.01a9.9 9.9 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.87 9.87 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.52 3.45A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.42-8.46z" />
    </svg>
  );
}

const FEATURES = [
  "Pipeline y métricas por vendedor, siempre al día",
  "Clientes y propiedades que se cruzan solos según lo que buscan",
  "Visitas, tareas y seguimientos que nunca se olvidan",
  "Cada vendedor ve lo suyo; la gerencia ve todo el negocio",
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

          <LoginForm next={next} />

          {demo && (
            <div className="mt-6 space-y-3 rounded-lg bg-primary/5 px-3 py-3 text-xs text-muted-foreground">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>
                  Esta es una <b className="text-foreground">página de demostración</b>. Si quieres ver el sistema por dentro, agenda una cita o pide tus credenciales de acceso.
                </span>
              </p>
              <a
                href={`https://wa.me/${DEMO_WHATSAPP}?text=${encodeURIComponent(DEMO_WHATSAPP_MESSAGE)}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-semibold text-white transition-colors hover:bg-[#1fb857]"
              >
                <WhatsAppLogo className="size-5" />
                Escríbeme por WhatsApp
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
