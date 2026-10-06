import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Bath, BedDouble, Building, Calendar, Car, Check, Eye, Layers, MapPin, MessageSquare, Phone, Ruler, ShieldCheck, Sofa, TrendingDown, User } from "lucide-react";
import { OptBadge, PropertyStatusBadge } from "@/components/shared/badges";
import { DocumentsPanel } from "@/components/shared/documents-panel";
import { OpportunitiesList, VisitsList } from "@/components/shared/entity-lists";
import { Breadcrumbs } from "@/components/shared/page-header";
import { ActivityTimeline } from "@/components/shared/timeline";
import { UserChip } from "@/components/shared/user-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireSession } from "@/lib/auth/session";
import { getLookups } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { PROPERTY_FEATURES, PUBLICATION_STATUSES } from "@/lib/domain/constants";
import { fmtDate, fmtDateTimeFull } from "@/lib/domain/dates";
import { formatArea, formatMoney } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { formatPhone } from "@/lib/domain/phone";
import { listDocuments } from "@/lib/services/documents";
import { opportunitiesForRecord } from "@/lib/services/opportunities";
import { getProperty, listPriceHistory, listPropertyImages, propertyStats } from "@/lib/services/properties";
import { listTimeline } from "@/lib/services/timeline";
import { visitsForRecord } from "@/lib/services/visits";
import { PropertyGallery } from "./gallery";
import { InterestedParties, PropertyActions } from "./property-controls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Propiedad" };

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lookups = await getLookups();

  const data = await withUser({ id: session.id, email: session.email }, async (db) => {
    const property = await getProperty(db, id);
    if (!property) return null;
    const canOpps = can(session.role, "opportunities.access");
    const [images, history, stats, visits, opps, docs, timeline, leads] = await Promise.all([
      listPropertyImages(db, id),
      listPriceHistory(db, id),
      propertyStats(db, id),
      visitsForRecord(db, { propertyId: id }),
      canOpps ? opportunitiesForRecord(db, { propertyId: id }) : Promise.resolve([]),
      listDocuments(db, { propertyId: id }),
      listTimeline(db, { propertyId: id, limit: 100 }),
      db.query<{ id: string; full_name: string; stage: string; assigned_to: string | null; created_at: string; source: string }>(
        "select id, full_name, stage, assigned_to, created_at, source from public.leads where property_id = $1 order by created_at desc limit 20",
        [id],
      ),
    ]);
    return { property, images, history, stats, visits, opps, docs, timeline, leads };
  });
  if (!data) notFound();
  const { property: p, images, history, stats, visits, opps, docs, timeline, leads } = data;

  const canEdit = can(session.role, "properties.edit_any") || (session.role === "advisor" && p.advisor_id === session.id);
  const canFinancials = can(session.role, "properties.financials");
  const rent = p.operation === "rent";
  const area = p.total_area ?? p.built_area;
  const label = `${p.code} · ${p.title}`;
  const mapSrc = p.latitude != null && p.longitude != null ? `https://www.openstreetmap.org/export/embed.html?bbox=${p.longitude - 0.006}%2C${p.latitude - 0.0035}%2C${p.longitude + 0.006}%2C${p.latitude + 0.0035}&layer=mapnik&marker=${p.latitude}%2C${p.longitude}` : null;
  const featureLabels = p.features.map((f) => PROPERTY_FEATURES.find((x) => x.value === f)?.label ?? f);
  const first = history[history.length - 1];
  const totalChange = first && history.length > 1 ? ((p.price - first.new_price) / first.new_price) * 100 : null;

  return (
    <>
      <Breadcrumbs items={[{ label: "Propiedades", href: "/properties" }, { label: p.code }]} />

      <PropertyGallery images={images} title={p.title} canEdit={canEdit} propertyId={id} />

      <section className="mt-5 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{p.code}</span>
              <PropertyStatusBadge value={p.status} />
              <OptBadge list={PUBLICATION_STATUSES} value={p.publication_status} />
              <span className="text-xs text-muted-foreground">{lookups.propertyType(p.property_type)} · {rent ? "Alquiler" : "Venta"}</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{p.title}</h1>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" /> {[p.address, lookups.district(p.district), p.province].filter(Boolean).join(", ")}
            </div>
            {p.reference && <div className="mt-0.5 text-xs text-muted-foreground">{p.reference}</div>}
          </div>
          <div className="shrink-0 text-left lg:text-right">
            <div className="text-3xl leading-none font-semibold tabular">
              {formatMoney(p.price, p.currency)}
              {rent && <span className="text-base font-normal text-muted-foreground"> /mes</span>}
            </div>
            {totalChange != null && Math.abs(totalChange) >= 0.1 && (
              <div className={`mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${totalChange < 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {totalChange < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                {Math.abs(totalChange).toFixed(1)}% desde el precio inicial
              </div>
            )}
            {canFinancials && p.min_price != null && <div className="mt-1 text-xs text-muted-foreground">Mínimo negociable: {formatMoney(p.min_price, p.currency)}</div>}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-3 lg:grid-cols-6">
          <Fact icon={<BedDouble className="size-4" />} label="Dormitorios" value={p.bedrooms ?? "—"} />
          <Fact icon={<Bath className="size-4" />} label="Baños" value={p.bathrooms ?? "—"} />
          <Fact icon={<Ruler className="size-4" />} label="Área total" value={formatArea(area)} />
          <Fact icon={<Building className="size-4" />} label="Área construida" value={formatArea(p.built_area)} />
          <Fact icon={<Car className="size-4" />} label="Estacionamientos" value={p.parking} />
          <Fact icon={<Calendar className="size-4" />} label="Antigüedad" value={p.age_years == null ? "—" : p.age_years === 0 ? "Estreno" : `${p.age_years} años`} />
        </dl>
        <div className="mt-4 border-t pt-4">
          <PropertyActions p={{ id, code: p.code, title: p.title, price: p.price, min_price: p.min_price, currency: p.currency, status: p.status, publication_status: p.publication_status, advisor_id: p.advisor_id, operation: p.operation }} canEdit={canEdit} canFinancials={canFinancials} />
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <Tabs defaultValue="summary">
            <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
              {[
                ["summary", "Resumen", null],
                ["interested", "Interesados compatibles", null],
                ["leads", "Consultas", leads.length],
                ["visits", "Visitas", visits.length],
                ...(can(session.role, "opportunities.access") ? [["opps", "Oportunidades", opps.length]] : []),
                ["price", "Precio", history.length],
                ["docs", "Documentos", docs.length],
                ["history", "Historial", timeline.total],
              ].map(([v, l, n]) => (
                <TabsTrigger key={v as string} value={v as string} className="rounded-lg border bg-card px-3 py-1.5 text-[13px] data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  {l as string}
                  {n != null && Number(n) > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] tabular">{n as number}</span>}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="summary" className="space-y-5">
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="text-sm font-semibold">Descripción</h2>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{p.description || "Sin descripción registrada."}</p>
                {featureLabels.length > 0 && (
                  <>
                    <h3 className="mt-5 text-sm font-semibold">Características y amenities</h3>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {featureLabels.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <span className="flex size-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <dl className="mt-5 grid gap-x-8 gap-y-2 border-t pt-4 text-sm sm:grid-cols-2">
                  <Spec label="Piso" value={p.floor ?? "—"} />
                  <Spec label="Ascensor" value={p.elevator ? "Sí" : "No"} />
                  <Spec label="Amoblado" value={p.furnished ? "Sí" : "No"} icon={<Sofa className="size-3.5" />} />
                  <Spec label="Seguridad" value={p.features.includes("security") ? "24 horas" : "—"} icon={<ShieldCheck className="size-3.5" />} />
                  <Spec label="Código interno" value={p.code} />
                  <Spec label="Fecha de publicación" value={p.published_at ? fmtDate(p.published_at) : "Sin publicar"} />
                  <Spec label="Última modificación" value={fmtDateTimeFull(p.updated_at)} />
                  <Spec label="Registrada" value={fmtDate(p.created_at)} />
                </dl>
              </section>
              <section className="overflow-hidden rounded-xl border bg-card shadow-card">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="size-4 text-muted-foreground" /> Ubicación
                  </h2>
                  {p.latitude != null && p.longitude != null && (
                    <a href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                      Abrir en mapa grande
                    </a>
                  )}
                </div>
                {mapSrc ? (
                  <iframe title={`Mapa de ${p.code}`} src={mapSrc} className="h-72 w-full border-t" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div className="border-t px-5 py-10 text-center text-sm text-muted-foreground">Esta propiedad no tiene coordenadas. Agrega latitud y longitud al editarla para ver el mapa.</div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="interested">
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="text-sm font-semibold">Leads y clientes que buscan algo como esto</h2>
                <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Matching inverso: compara el precio, distrito, tipo, habitaciones y área con la búsqueda de cada persona.</p>
                <InterestedParties propertyId={id} propertyLabel={label} />
              </section>
            </TabsContent>

            <TabsContent value="leads">
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="mb-3 text-sm font-semibold">Consultas recibidas</h2>
                {leads.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay consultas registradas para esta propiedad.</p>
                ) : (
                  <ul className="divide-y">
                    {leads.map((l) => (
                      <li key={l.id}>
                        <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{l.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {lookups.source(l.source)} · {fmtDate(l.created_at)} · {lookups.userName(l.assigned_to)}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">{lookups.stageLabel(l.stage)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>
            <TabsContent value="visits">
              <VisitsList visits={visits} context={{ propertyId: id, propertyLabel: label }} showParty />
            </TabsContent>
            <TabsContent value="opps">
              <OpportunitiesList opps={opps} context={{ propertyId: id, propertyLabel: label }} showParty />
            </TabsContent>
            <TabsContent value="price">
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <TrendingDown className="size-4 text-muted-foreground" /> Historial de precio
                </h2>
                <ul className="divide-y">
                  {history.map((h) => {
                    const delta = h.old_price ? ((h.new_price - h.old_price) / h.old_price) * 100 : null;
                    return (
                      <li key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div>
                          <div className="font-medium tabular">{formatMoney(h.new_price, h.currency)}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDateTimeFull(h.changed_at)}
                            {h.changed_by ? ` · ${lookups.userName(h.changed_by)}` : ""}
                          </div>
                        </div>
                        {delta == null ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">Precio inicial</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular ${delta < 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                            {delta < 0 ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
                            {Math.abs(delta).toFixed(1)}% (de {formatMoney(h.old_price, h.currency)})
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </TabsContent>
            <TabsContent value="docs">
              <DocumentsPanel documents={docs} scope={{ propertyId: id }} />
            </TabsContent>
            <TabsContent value="history">
              <ActivityTimeline items={timeline.items} link={{ propertyId: id }} showParty title="Historial de la propiedad" />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="min-w-0 space-y-5">
          <section className="rounded-xl border bg-card p-4 shadow-card">
            <h3 className="mb-3 text-sm font-semibold">Indicadores</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<MessageSquare className="size-4" />} label="Consultas" value={stats.inquiries} />
              <Stat icon={<Eye className="size-4" />} label="Visitas realizadas" value={stats.visits_done} />
              <Stat icon={<Calendar className="size-4" />} label="Visitas pendientes" value={stats.visits_pending} />
              <Stat icon={<Layers className="size-4" />} label="Oportunidades" value={stats.open_opportunities} />
            </div>
            <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {stats.days_listed} días en cartera{stats.inquiries === 0 && stats.days_listed > 14 ? " · sin consultas: revisa precio o difusión" : ""}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 shadow-card">
            <h3 className="mb-3 text-sm font-semibold">Gestión comercial</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Asesor responsable</dt>
                <dd className="mt-1">
                  <UserChip userId={p.advisor_id} size="sm" />
                </dd>
              </div>
              {canFinancials && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Comisión</dt>
                    <dd className="font-medium tabular">{p.commission_pct != null ? `${p.commission_pct}%` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Precio mínimo</dt>
                    <dd className="font-medium tabular">{p.min_price != null ? formatMoney(p.min_price, p.currency) : "—"}</dd>
                  </div>
                </div>
              )}
            </dl>
          </section>

          {p.owner_id && (
            <Link href={`/owners/${p.owner_id}`} className="block rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Propietario</div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <User className="size-4 text-muted-foreground" /> {p.owner_name}
              </div>
              {p.owner_phone && (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground tabular">
                  <Phone className="size-3.5" /> {formatPhone(p.owner_phone)}
                </div>
              )}
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
        <dd className="text-sm font-semibold tabular">{value}</dd>
      </div>
    </div>
  );
}

function Spec({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border/70 py-1">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular">{value}</div>
    </div>
  );
}
