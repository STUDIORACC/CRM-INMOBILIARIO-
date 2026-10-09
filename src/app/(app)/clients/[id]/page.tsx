import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, Mail, MapPin, Phone } from "lucide-react";
import { MatchSuggestions } from "@/components/matching/match-suggestions";
import { TagChip } from "@/components/shared/badges";
import { DocumentsPanel } from "@/components/shared/documents-panel";
import { OpportunitiesList, TasksList, VisitsList } from "@/components/shared/entity-lists";
import { Breadcrumbs } from "@/components/shared/page-header";
import { ProfileCard } from "@/components/shared/profile-card";
import { PropertyImage } from "@/components/shared/property-image";
import { EmptyState } from "@/components/shared/states";
import { ActivityTimeline } from "@/components/shared/timeline";
import { UserAvatar, UserChip } from "@/components/shared/user-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireSession } from "@/lib/auth/session";
import { getLookups } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { fmtDate } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { can } from "@/lib/domain/permissions";
import { formatPhone } from "@/lib/domain/phone";
import { getClient } from "@/lib/services/clients";
import { listDocuments } from "@/lib/services/documents";
import { opportunitiesForRecord } from "@/lib/services/opportunities";
import { tasksForRecord } from "@/lib/services/tasks";
import { listTimeline } from "@/lib/services/timeline";
import { visitsForRecord } from "@/lib/services/visits";
import { ClientActionBar } from "./client-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cliente" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lookups = await getLookups();

  const data = await withUser({ id: session.id, email: session.email }, async (db) => {
    const client = await getClient(db, id);
    if (!client) return null;
    const leadIds = (await db.query<{ id: string }>("select id from public.leads where client_id = $1", [id])).map((l) => l.id);
    const [timeline, tasks, visits, opps, docs, seen] = await Promise.all([
      listTimeline(db, { clientId: id, leadIds, limit: 150 }),
      tasksForRecord(db, { clientId: id, leadIds }),
      visitsForRecord(db, { clientId: id, leadIds }),
      opportunitiesForRecord(db, { clientId: id, leadIds }),
      listDocuments(db, { clientId: id }),
      db.query<{ id: string; code: string; title: string; district: string; price: number; currency: "PEN" | "USD"; operation: string; image: string | null; visits: number; last_visit: string; outcome: string | null }>(
        `select p.id, p.code, p.title, p.district, p.price, p.currency, p.operation,
                (select url from public.property_images pi where pi.property_id = p.id order by pi.is_cover desc, pi.position limit 1) as image,
                count(*)::int as visits, max(v.scheduled_at) as last_visit,
                (array_agg(v.outcome order by v.scheduled_at desc))[1] as outcome
           from public.visits v join public.properties p on p.id = v.property_id
          where v.status = 'completed' and (v.client_id = $1 or v.lead_id = any($2::uuid[]))
          group by p.id order by max(v.scheduled_at) desc`,
        [id, leadIds],
      ),
    ]);
    return { client, leadIds, timeline, tasks, visits, opps, docs, seen };
  });
  if (!data) notFound();
  const { client, timeline, tasks, visits, opps, docs, seen } = data;
  const ctx = { clientId: id, clientName: client.full_name };
  const pinned = timeline.items.filter((i) => i.note_pinned);

  return (
    <>
      <Breadcrumbs items={[{ label: "Clientes", href: "/clients" }, { label: client.full_name }]} />
      <section className="mb-5 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <UserAvatar name={client.full_name} src={client.avatar_url} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold">{client.full_name}</h1>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${client.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"}`}>{client.status === "active" ? "Cliente activo" : "Inactivo"}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {client.phone && (
                  <span className="inline-flex items-center gap-1.5 tabular">
                    <Phone className="size-3.5" /> {formatPhone(client.phone)}
                  </span>
                )}
                {client.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" /> {client.email}
                  </span>
                )}
                {client.doc_number && <span>{client.doc_type?.toUpperCase()} {client.doc_number}</span>}
                {client.address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" /> {client.address}
                  </span>
                )}
                <span>Cliente desde {fmtDate(client.created_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Asesor:</span>
                <UserChip userId={client.assigned_to} size="sm" />
                {client.tags.map((t) => (
                  <TagChip key={t.id} name={t.name} color={t.color} />
                ))}
                {client.source_lead_id && (
                  <Link href={`/leads/${client.source_lead_id}`} className="text-xs text-primary hover:underline">
                    Ver lead de origen
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 border-t pt-4">
          <ClientActionBar client={{ id, full_name: client.full_name, phone: client.phone, email: client.email, status: client.status, assigned_to: client.assigned_to, tagIds: client.tags.map((t) => t.id) }} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <Tabs defaultValue="history">
            <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
              {[
                ["history", "Historial", timeline.total],
                ["matches", "Propiedades compatibles", null],
                ["seen", "Propiedades vistas", seen.length],
                ["work", "Tareas y visitas", tasks.filter((t) => ["pending", "in_progress"].includes(t.status)).length + visits.filter((v) => ["scheduled", "confirmed"].includes(v.status)).length],
                ["opps", "Oportunidades", opps.length],
                ["docs", "Documentos", docs.length],
              ].map(([v, label, n]) => (
                <TabsTrigger key={v as string} value={v as string} className="rounded-lg border bg-card px-3 py-1.5 text-[13px] data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  {label as string}
                  {n != null && Number(n) > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] tabular">{n as number}</span>}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="history">
              <ActivityTimeline items={timeline.items} link={{ clientId: id }} pinned={pinned} />
            </TabsContent>
            <TabsContent value="matches">
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h3 className="text-sm font-semibold">Propiedades compatibles con su búsqueda</h3>
                <p className="mb-4 mt-0.5 text-xs text-muted-foreground">Coincidencia calculada con las preferencias del cliente: operación, tipo, presupuesto, distritos, habitaciones, baños y área.</p>
                <MatchSuggestions clientId={id} />
              </section>
            </TabsContent>
            <TabsContent value="seen">
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h3 className="mb-3 text-sm font-semibold">Propiedades que ya visitó</h3>
                {seen.length === 0 ? (
                  <EmptyState compact icon={<Eye className="size-5" />} title="Aún no ha visitado propiedades" description="Agenda una visita para empezar a construir su historial." />
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {seen.map((p) => (
                      <li key={p.id}>
                        <Link href={`/properties/${p.id}`} className="flex gap-3 rounded-xl border p-2.5 hover:border-primary/40">
                          <PropertyImage src={p.image} alt={p.title} className="size-16 shrink-0 rounded-lg" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {p.code} · {p.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {lookups.district(p.district)} · {formatMoney(p.price, p.currency)}
                              {p.operation === "rent" ? "/mes" : ""}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {p.visits} {p.visits === 1 ? "visita" : "visitas"} · última {fmtDate(p.last_visit)}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>
            <TabsContent value="work" className="space-y-5">
              <TasksList tasks={tasks} context={ctx} />
              <VisitsList visits={visits} context={ctx} />
            </TabsContent>
            <TabsContent value="opps">
              <OpportunitiesList opps={opps} context={ctx} canCreate={can(session.role, "opportunities.access")} />
            </TabsContent>
            <TabsContent value="docs">
              <DocumentsPanel documents={docs} scope={{ clientId: id }} />
            </TabsContent>
          </Tabs>
        </div>
        <aside className="min-w-0 space-y-5">
          <ProfileCard profile={client} lookups={lookups} editKind="client" editCtx={{ clientId: id }} title="Preferencias de búsqueda" />
          {client.search_notes && (
            <section className="rounded-xl border bg-card p-4 shadow-card">
              <h3 className="mb-1.5 text-sm font-semibold">Notas de la búsqueda</h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{client.search_notes}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
