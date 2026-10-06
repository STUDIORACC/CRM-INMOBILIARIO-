import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Building2, ListChecks, MessageSquareText, Tag, UserRound, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can, type Capability } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";
import { AlertsTab } from "./alerts-tab";
import { CatalogsTab } from "./catalogs-tab";
import { CompanyTab } from "./company-tab";
import { ProfileTab } from "./profile-tab";
import { TagsTab } from "./tags-tab";
import { TemplatesTab } from "./templates-tab";
import { UsersTab } from "./users-tab";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

const TABS: Array<{ key: string; label: string; icon: typeof UserRound; capability?: Capability }> = [
  { key: "profile", label: "Mi perfil", icon: UserRound },
  { key: "company", label: "Empresa", icon: Building2, capability: "settings.manage" },
  { key: "crm", label: "Catálogos y pipeline", icon: ListChecks, capability: "settings.manage" },
  { key: "users", label: "Usuarios y roles", icon: Users, capability: "settings.manage" },
  { key: "alerts", label: "Alertas", icon: Bell, capability: "settings.manage" },
  { key: "tags", label: "Etiquetas", icon: Tag, capability: "tags.manage" },
  { key: "templates", label: "Plantillas", icon: MessageSquareText, capability: "templates.manage" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const tabs = TABS.filter((t) => !t.capability || can(session.role, t.capability));
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? "profile";
  const phone = tab === "profile" ? await withUser({ id: session.id, email: session.email }, (db) => db.scalar<string | null>("select phone from public.users where id = $1", [session.id])) : null;

  return (
    <>
      <PageHeader title="Configuración" description={can(session.role, "settings.manage") ? "Administra tu inmobiliaria: datos de la empresa, catálogos, equipo, alertas y plantillas." : "Tu perfil y las herramientas de tu rol."} />
      <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Secciones de configuración">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <Link key={t.key} href={t.key === "profile" ? "/settings" : `/settings?tab=${t.key}`} role="tab" aria-selected={on} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>
              <Icon className="size-3.5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      {tab === "profile" && <ProfileTab phone={phone ?? null} />}
      {tab === "company" && <CompanyTab />}
      {tab === "crm" && <CatalogsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "alerts" && <AlertsTab />}
      {tab === "tags" && <TagsTab />}
      {tab === "templates" && <TemplatesTab />}
    </>
  );
}
