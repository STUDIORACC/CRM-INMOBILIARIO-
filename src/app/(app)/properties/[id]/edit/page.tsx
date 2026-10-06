import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header";
import { NoAccess } from "@/components/shared/states";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { getProperty, getPropertyForEdit } from "@/lib/services/properties";
import { PropertyForm } from "../../property-form";

export const metadata: Metadata = { title: "Editar propiedad" };
export const dynamic = "force-dynamic";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withUser({ id: session.id, email: session.email }, async (db) => {
    const p = await getProperty(db, id);
    if (!p) return null;
    return { p, initial: await getPropertyForEdit(db, id) };
  });
  if (!data || !data.initial) notFound();
  const canEdit = can(session.role, "properties.edit_any") || (session.role === "advisor" && data.p.advisor_id === session.id);
  if (!canEdit) return <NoAccess message="Solo el asesor responsable o gerencia pueden editar esta propiedad." />;
  return (
    <>
      <Breadcrumbs items={[{ label: "Propiedades", href: "/properties" }, { label: data.p.code, href: `/properties/${id}` }, { label: "Editar" }]} />
      <PageHeader title={`Editar ${data.p.code}`} description={data.p.title} />
      <PropertyForm propertyId={id} initial={data.initial} ownerLabel={data.p.owner_name ?? undefined} />
    </>
  );
}
