import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Eye, Handshake, Mail, MapPin, Phone, Trophy } from "lucide-react";
import { OptBadge } from "@/components/shared/badges";
import { DocumentsPanel } from "@/components/shared/documents-panel";
import { VisitsList } from "@/components/shared/entity-lists";
import { Breadcrumbs } from "@/components/shared/page-header";
import { NoAccess } from "@/components/shared/states";
import { ActivityTimeline } from "@/components/shared/timeline";
import { UserAvatar } from "@/components/shared/user-avatar";
import { PropertyCard } from "@/app/(app)/properties/properties-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { DOC_TYPES, OWNER_TYPES, labelOf } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import { formatMoneyCompact } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { formatPhone } from "@/lib/domain/phone";
import { getCatalogs } from "@/lib/catalogs";
import { listDocuments } from "@/lib/services/documents";
import { getOwner } from "@/lib/services/owners";
import { listProperties } from "@/lib/services/properties";
import { listTimeline } from "@/lib/services/timeline";
import { visitsForRecord } from "@/lib/services/visits";
import { propertyListQuerySchema } from "@/lib/validation/properties";
import { OwnerActionBar } from "./owner-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Propietario" };

export default async function OwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session.role, "owners.access")) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const catalogs = await getCatalogs();

  const data = await withUser({ id: session.id, email: session.email }, async (db) => {
    const owner = await getOwner(db, id);
    if (!owner) return null;
    const props = await listProperties(db, propertyListQuerySchema.parse({ owner: id, pageSize: "100", sort: "code", dir: "asc" }));
    const propertyIds = props.rows.map((p) => p.id);
    const [timeline, docs, ops] = await Promise.all([
      listTimeline(db, { ownerId: id, propertyIds, limit: 120 }),
      listDocuments(db, { ownerId: id }),
      can(session.role, "opportunities.access")
        ? db.query<{ id: string; party: string; code: string; value: number; currency: "PEN" | "USD"; won_at: string; operation: string }>(
            `select o.id, coalesce(l.full_name, c.full_name) as party, p.code, o.value, o.currency, o.won_at, o.operation
               from public.opportunities o join public.properties p on p.id = o.property_id
               left join public.leads l on l.id = o.lead_id left join public.clients c on c.id = o.client_id
              where p.owner_id = $1 and o.stage = 'won' order by o.won_at desc`,
            [id],
          )
        : Promise.resolve([]),
    ]);
    const propVisits = propertyIds.length
      ? (await Promise.all(propertyIds.slice(0, 20).map((pid) => visitsForRecord(db, { propertyId: pid })))).flat().sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)).slice(0, 30)
      : [];
    return { owner, props, timeline, docs, propVisits, ops };
  });
  if (!data) notFound();
  const { owner, props, timeline, docs, propVisits, ops } = data;

  return (
    <>
      <Breadcrumbs items={[{ label: "Propietarios", href: "/owners" }, { label: owner.full_name }]} />
      <section className="mb-5 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex items-start gap-4">
          <UserAvatar name={owner.full_name} size="xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold">{owner.full_name}</h1>
              <OptBadge list={OWNER_TYPES} value={owner.owner_type} dot={false} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {owner.doc_number && <span>{owner.doc_type ? labelOf(DOC_TYPES, owner.doc_type) : "Doc."} {owner.doc_number}</span>}
              {owner.phone && (
                <span className="inline-flex items-center gap-1.5 tabular">
                  <Phone className="size-3.5" /> {formatPhone(owner.phone)}
                </span>
              )}
              {owner.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" /> {owner.email}
                </span>
              )}
              {owner.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {owner.address}
                </span>
              )}
              <span>Registrado {fmtDate(owner.created_at)}</span>
            </div>
            {owner.notes && <p className="mt-2 max-w-3xl rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{owner.notes}</p>}
          </div>
        </div>
        <div className="mt-4 border-t pt-4">
          <OwnerActionBar owner={{ id, full_name: owner.full_name, phone: owner.phone }} />
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi icon={<Building2 className="size-4" />} label="Propiedades" value={owner.properties} />
        <Kpi icon={<Building2 className="size-4" />} label="Activas" value={owner.active_properties} />
        <Kpi icon={<Trophy className="size-4" />} label="Vendidas" value={owner.sold_properties} />
        <Kpi icon={<Trophy className="size-4" />} label="Alquiladas" value={owner.rented_properties} />
        <Kpi icon={<Eye className="size-4" />} label="Visitas" value={owner.visits} />
        <Kpi icon={<Handshake className="size-4" />} label="Operaciones" value={owner.operations} hint={owner.portfolio_value ? `Cartera ${formatMoneyCompact(owner.portfolio_value, catalogs.company.currency)}` : undefined} />
      </div>

      <Tabs defaultValue="props">
        <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {[
            ["props", "Propiedades", props.total],
            ["visits", "Visitas", propVisits.length],
            ["ops", "Operaciones", ops.length],
            ["docs", "Documentos", docs.length],
            ["history", "Historial", timeline.total],
          ].map(([v, l, n]) => (
            <TabsTrigger key={v as string} value={v as string} className="rounded-lg border bg-card px-3 py-1.5 text-[13px] data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              {l as string}
              {Number(n) > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] tabular">{n as number}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="props">
          {props.rows.length === 0 ? (
            <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground shadow-card">Este propietario aún no tiene propiedades asociadas.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {props.rows.map((p) => (
                <PropertyCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="visits">
          <VisitsList visits={propVisits} context={{}} showParty title="Visitas a sus propiedades" />
        </TabsContent>
        <TabsContent value="ops">
          <section className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold">Operaciones cerradas</h3>
            {ops.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay operaciones cerradas sobre sus propiedades.</p>
            ) : (
              <ul className="divide-y">
                {ops.map((o) => (
                  <li key={o.id}>
                    <Link href={`/opportunities/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{o.code} · {o.party}</div>
                        <div className="text-xs text-muted-foreground">{o.operation === "rent" ? "Alquiler" : "Venta"} · {fmtDate(o.won_at)}</div>
                      </div>
                      <span className="text-sm font-semibold tabular">{formatMoneyCompact(o.value, o.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
        <TabsContent value="docs">
          <DocumentsPanel documents={docs} scope={{ ownerId: id }} />
        </TabsContent>
        <TabsContent value="history">
          <ActivityTimeline items={timeline.items} link={{ ownerId: id }} showParty title="Historial completo" />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3.5 shadow-card">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
