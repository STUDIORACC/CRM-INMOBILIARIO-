import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, Info, Mail, Phone } from "lucide-react";
import { MatchSuggestions } from "@/components/matching/match-suggestions";
import { TagChip, TemperatureBadge } from "@/components/shared/badges";
import { DocumentsPanel } from "@/components/shared/documents-panel";
import { OpportunitiesList, TasksList, VisitsList } from "@/components/shared/entity-lists";
import { Breadcrumbs } from "@/components/shared/page-header";
import { ProfileCard } from "@/components/shared/profile-card";
import { PropertyImage } from "@/components/shared/property-image";
import { ActivityTimeline } from "@/components/shared/timeline";
import { UserAvatar, UserChip } from "@/components/shared/user-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireSession } from "@/lib/auth/session";
import { getLookups } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { daysSince, fmtDate, fmtDateTimeFull } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { leadNextAction } from "@/lib/domain/next-action";
import { formatPhone } from "@/lib/domain/phone";
import { listDocuments } from "@/lib/services/documents";
import { explainLeadScore } from "@/lib/services/lead-score";
import { findDuplicates, getLead } from "@/lib/services/leads";
import { opportunitiesForRecord } from "@/lib/services/opportunities";
import { tasksForRecord } from "@/lib/services/tasks";
import { listTimeline } from "@/lib/services/timeline";
import { visitsForRecord } from "@/lib/services/visits";
import { cn } from "@/lib/utils";
import { LeadActionBar, LeadHeaderControls } from "./lead-header";
import { ScoreCard } from "./score-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lead" };

const TONE_BOX = {
  danger: "border-rose-200 bg-rose-50 text-rose-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  muted: "border-border bg-muted/50 text-foreground",
} as const;

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lookups = await getLookups();

  const data = await withUser({ id: session.id, email: session.email }, async (db) => {
    const lead = await getLead(db, id);
    if (!lead) return null;
    const [timeline, tasks, visits, opps, score, docs, dups] = await Promise.all([
      listTimeline(db, { leadId: id, clientId: lead.client_id, limit: 150 }),
      tasksForRecord(db, { leadId: id }),
      visitsForRecord(db, { leadId: id }),
      opportunitiesForRecord(db, { leadId: id }),
      explainLeadScore(db, id),
      listDocuments(db, { leadId: id }),
      findDuplicates(db, { phone: lead.phone, email: lead.email, excludeId: id }),
    ]);
    return { lead, timeline, tasks, visits, opps, score, docs, dups };
  });
  if (!data) notFound();
  const { lead, timeline, tasks, visits, opps, score, docs, dups } = data;

  const action = leadNextAction(lead);
  const idle = daysSince(lead.last_activity_at);
  const responseMin = lead.first_contacted_at ? Math.max(0, Math.round((new Date(lead.first_contacted_at).getTime() - new Date(lead.created_at).getTime()) / 60000)) : null;
  const responseLabel = responseMin == null ? "Sin contactar" : responseMin < 60 ? `${responseMin} min` : responseMin < 1440 ? `${(responseMin / 60).toFixed(1)} h` : `${(responseMin / 1440).toFixed(1)} días`;
  const ctx = { leadId: lead.id, leadName: lead.full_name, propertyId: lead.property_id ?? undefined, propertyLabel: lead.property_code ? `${lead.property_code} · ${lead.property_title}` : undefined };
  const pinned = timeline.items.filter((i) => i.note_pinned);

  return (
    <>
      <Breadcrumbs items={[{ label: "Leads", href: "/leads" }, { label: lead.full_name }]} />

      {/* Cabecera */}
      <section className="mb-5 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <UserAvatar name={lead.full_name} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold">{lead.full_name}</h1>
                <TemperatureBadge score={lead.score} temperature={lead.temperature} />
                {lead.client_id && (
                  <Link href={`/clients/${lead.client_id}`} className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                    Cliente · ver ficha
                  </Link>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {lead.phone && (
                  <span className="inline-flex items-center gap-1.5 tabular">
                    <Phone className="size-3.5" /> {formatPhone(lead.phone)}
                  </span>
                )}
                {lead.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" /> {lead.email}
                  </span>
                )}
                <span>Fuente: {lookups.source(lead.source)}</span>
                <span>Creado {fmtDate(lead.created_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Vendedor:</span>
                <UserChip userId={lead.assigned_to} size="sm" />
                {lead.tags.map((t) => (
                  <TagChip key={t.id} name={t.name} color={t.color} />
                ))}
              </div>
            </div>
          </div>
          <LeadHeaderControls lead={lead} />
        </div>
        <div className="mt-4 border-t pt-4">
          <LeadActionBar lead={lead} />
        </div>
      </section>

      {/* Próxima acción */}
      <div className={cn("mb-5 flex items-start gap-3 rounded-xl border p-4", TONE_BOX[action.tone])} role="status">
        <span className="mt-0.5">{action.tone === "danger" ? <AlertTriangle className="size-5" /> : action.tone === "ok" ? <CheckCircle2 className="size-5" /> : action.tone === "warning" ? <Clock className="size-5" /> : <Info className="size-5" />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wider uppercase opacity-70">¿Qué debo hacer ahora?</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-base font-semibold">
            {action.text}
            {action.when && (
              <span className="inline-flex items-center gap-1 text-sm font-medium opacity-80">
                <CalendarClock className="size-4" /> {action.when}
              </span>
            )}
          </div>
          {action.hint && <p className="mt-0.5 text-sm opacity-80">{action.hint}</p>}
          {lead.stage !== "lost" && lead.stage !== "won" && idle != null && idle >= 3 && !action.hint?.includes("sin") && <p className="mt-0.5 text-sm opacity-80">Último contacto hace {idle} días.</p>}
        </div>
      </div>

      {dups.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <b>Posible duplicado:</b>{" "}
            {dups.slice(0, 2).map((d, i) => (
              <span key={d.id}>
                {i > 0 && ", "}
                <Link href={d.kind === "lead" ? `/leads/${d.id}` : `/clients/${d.id}`} className="font-medium underline">
                  {d.full_name}
                </Link>{" "}
                ({d.kind === "lead" ? "lead" : "cliente"}, {d.phone_match ? "mismo teléfono" : "mismo correo"})
              </span>
            ))}
            {can(session.role, "leads.delete") ? ". Usa “Fusionar con otro lead” en el menú ⋯ para unificarlos." : ". Pide a un gerente que los fusione."}
          </span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <Tabs defaultValue="history">
            <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
              {[
                ["history", "Historial", timeline.total],
                ["matches", "Propiedades compatibles", null],
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
              <ActivityTimeline items={timeline.items} link={{ leadId: lead.id }} pinned={pinned} />
            </TabsContent>
            <TabsContent value="matches">
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h3 className="text-sm font-semibold">Propiedades compatibles</h3>
                <p className="mb-4 mt-0.5 text-xs text-muted-foreground">Calculado con operación, tipo, presupuesto, distrito, habitaciones, baños y área de la calificación del lead.</p>
                <MatchSuggestions leadId={lead.id} />
              </section>
            </TabsContent>
            <TabsContent value="work" className="space-y-5">
              <TasksList tasks={tasks} context={ctx} />
              <VisitsList visits={visits} context={ctx} />
            </TabsContent>
            <TabsContent value="opps">
              <OpportunitiesList opps={opps} context={ctx} canCreate={can(session.role, "opportunities.access") && lead.stage !== "lost"} />
            </TabsContent>
            <TabsContent value="docs">
              <DocumentsPanel documents={docs} scope={{ leadId: lead.id }} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="min-w-0 space-y-5">
          <ScoreCard result={score} score={lead.score} />
          <ProfileCard profile={lead} lookups={lookups} editKind="lead" editCtx={{ leadId: lead.id }} />
          {lead.property_id && (
            <Link href={`/properties/${lead.property_id}`} className="group block overflow-hidden rounded-xl border bg-card shadow-card">
              <PropertyImage src={lead.property_image} alt={lead.property_title ?? ""} className="h-32 w-full" />
              <div className="p-3.5">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Propiedad de interés</div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-sm font-semibold group-hover:text-primary">
                  <span className="truncate">
                    {lead.property_code} · {lead.property_title}
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </div>
                {lead.property_price != null && lead.property_currency && (
                  <div className="mt-0.5 text-sm tabular text-muted-foreground">
                    {formatMoney(lead.property_price, lead.property_currency)}
                    {lead.property_operation === "rent" ? " /mes" : ""}
                  </div>
                )}
              </div>
            </Link>
          )}
          <section className="rounded-xl border bg-card p-4 shadow-card">
            <h3 className="mb-2 text-sm font-semibold">Seguimiento</h3>
            <dl className="space-y-2 text-sm">
              <Fact label="Tiempo de primera respuesta">{responseLabel}</Fact>
              <Fact label="Última actividad">{lead.last_activity_at ? fmtDateTimeFull(lead.last_activity_at) : "Sin actividad"}</Fact>
              <Fact label="Asignado">{lead.assigned_at ? fmtDateTimeFull(lead.assigned_at) : "Sin asignar"}</Fact>
              {lead.stage === "lost" && <Fact label="Motivo de pérdida">{lookups.lossReason(lead.lost_reason)}</Fact>}
            </dl>
            {lead.message && (
              <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
                <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Consulta inicial</div>
                {lead.message}
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
