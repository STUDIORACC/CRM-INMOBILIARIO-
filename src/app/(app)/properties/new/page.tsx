import type { Metadata } from "next";
import { NoAccess } from "@/components/shared/states";
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { PropertyForm } from "../property-form";

export const metadata: Metadata = { title: "Nueva propiedad" };
export const dynamic = "force-dynamic";

export default async function NewPropertyPage() {
  const session = await requireSession();
  if (!can(session.role, "properties.create")) return <NoAccess message="Tu rol no puede registrar propiedades." />;
  return (
    <>
      <Breadcrumbs items={[{ label: "Propiedades", href: "/properties" }, { label: "Nueva propiedad" }]} />
      <PageHeader title="Nueva propiedad" description="Registra el inmueble, asígnalo a un asesor y vincúlalo con su propietario. Las fotos se agregan al guardar." />
      <PropertyForm />
    </>
  );
}
