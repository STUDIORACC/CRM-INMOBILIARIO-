import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Mail, MapPin, Phone, Target, User } from "lucide-react";
import { ColorChip, PriorityBadge, PropertyStatusBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/page-header";
import { PropertyImage } from "@/components/shared/property-image";
import { NoAccess } from "@/components/shared/states";
import { TasksList, VisitsList } from "@/components/shared/entity-lists";
import { ActivityTimeline } from "@/components/shared/timeline";
import { UserChip } from "@/components/shared/user-avatar";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs, getLookups } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { fmtDate, fmtRelative } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";
import { can } from "@/lib/domain/permissions";
import { getOpportunity } from "@/lib/services/opportunities";
import { tasksForRecord } from "@/lib/services/tasks";
import { listTimeline } from "@/lib/services/timeline";
import { visitsForRecord } from "@/lib/services/visits";
import { OpportunityActions, StageStepper } from "./opportunity-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Oportunidad" };
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session.role, "opportunities.access")) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [catalogs, lookups] = await Promise.all([getCatalogs(), getLookups()]);

  const data = await withUser({ id: session.id, email: session.email }, async (db) => {
    const opp = await getOpportunity(db, id);
    if (!opp) return null;
    const [timeline, tasks, visits] = await Promise.all([
      listTimeline(db, { opportunityId: id, limit: 120 }),
      tasksForRecord(db, { opportunityId: id }),
      visitsForRecord(db, { opportunityId: id }),
    ]);
    return { opp, timeline, tasks, visits };
  });
  if (!data) notFound();
  const { opp, timeline, tasks, visits } = data;

  const stage = lookups.stage(opp.stage);
  const closed = stage?.kind !== "open";
  const symbol = opp.currency;
  const weighted = (opp.value * opp.probability) / 100;
  const phone = opp.lead_phone ?? opp.client_phone;
  const email = opp.lead_email ?? opp.client_email;
  const ctx = { opportunityId: id, leadId: opp.lead_id ?? undefined, clientId: opp.client_id ?? undefined, propertyId: opp.property_id, propertyLabel: `${opp.property_code} · ${opp.property_title}`, leadName: opp.party_name, clientName: opp.party_name };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Oportunidades", href: "/opportunities" }, { label: opp.party_name }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {opp.party_name}
            <span className="text-muted-foreground">→</span>
            <span className="text-xl font-semibold">{opp.property_code}</span>
            <ColorChip color={stage?.color ?? "#64748b"}>{stage?.label ?? opp.stage}</ColorChip>
          </span>
        }
        description={`${opp.property_title} · Creada ${fmtDate(opp.created_at)} · Actualizada ${fmtRelative(opp.updated_at)}`}
        icon={<span className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Target className="size-5" /></span>}
      />
      <div className="mb-5">
        <OpportunityActions opp={opp} closed={closed} />
      </div>

      <div className="mb-5">
        <StageStepper opp={opp} stages={catalogs.stages} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Valor" value={formatMoney(opp.value, symbol)} hint={opp.operation === "rent" ? "Contrato a 12 meses" : "Valor de la operación"} />
            <Metric label="Probabilidad" value={`${opp.probability}%`} hint={closed ? (stage?.kind === "won" ? "Cerrada ganada" : "Cerrada perdida") : "De cierre"} />
            <Metric label="Valor ponderado" value={formatMoney(weighted, symbol)} hint={`${formatMoney(opp.value, symbol)} × ${opp.probability}%`} />
            <Metric label="Cierre estimado" value={opp.expected_close_date ? fmtDate(opp.expected_close_date) : "—"} hint={opp.won_at ? `Ganada ${fmtDate(opp.won_at)}` : opp.lost_at ? `Perdida ${fmtDate(opp.lost_at)}` : "Fecha objetivo"} />
          </div>

          {!closed && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarClock className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-wide text-primary uppercase">Próximo paso</div>
                <div className="mt-0.5 text-sm font-medium">{opp.next_step ?? "Define el siguiente paso de esta oportunidad (Editar)."}</div>
                {opp.next_activity_at && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Próxima actividad: {opp.next_activity_title} · {fmtDate(opp.next_activity_at)}
                  </div>
                )}
              </div>
            </div>
          )}
          {stage?.kind === "lost" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <b>Perdida:</b> {lookups.lossReason(opp.lost_reason)}
              {opp.lost_notes ? ` — ${opp.lost_notes}` : ""}
            </div>
          )}

          <ActivityTimeline items={timeline.items} link={{ opportunityId: id, leadId: opp.lead_id ?? undefined, clientId: opp.client_id ?? undefined, propertyId: opp.property_id }} />
        </div>

        <aside className="min-w-0 space-y-5">
          <section className="rounded-xl border bg-card p-4 shadow-card">
            <h3 className="mb-3 text-sm font-semibold">Detalle</h3>
            <dl className="space-y-3 text-sm">
              <Row label={opp.client_id ? "Cliente" : "Lead"}>
                <Link href={opp.client_id ? `/clients/${opp.client_id}` : `/leads/${opp.lead_id}`} className="inline-flex items-center gap-1.5 font-medium hover:text-primary">
                  <User className="size-3.5 text-muted-foreground" /> {opp.party_name}
                </Link>
                {opp.client_id && opp.lead_id && (
                  <Link href={`/leads/${opp.lead_id}`} className="block text-xs text-muted-foreground hover:text-primary">
                    Ver lead de origen
                  </Link>
                )}
              </Row>
              {phone && (
                <Row label="Teléfono">
                  <span className="inline-flex items-center gap-1.5 tabular">
                    <Phone className="size-3.5 text-muted-foreground" /> {formatPhone(phone)}
                  </span>
                </Row>
              )}
              {email && (
                <Row label="Email">
                  <span className="inline-flex items-center gap-1.5 break-all">
                    <Mail className="size-3.5 text-muted-foreground" /> {email}
                  </span>
                </Row>
              )}
              <Row label="Vendedor">
                <UserChip userId={opp.assigned_to} size="sm" />
              </Row>
              <Row label="Prioridad">
                <PriorityBadge value={opp.priority} />
              </Row>
              <Row label="Operación">{opp.operation === "rent" ? "Alquiler" : "Venta"}</Row>
            </dl>
          </section>

          <Link href={`/properties/${opp.property_id}`} className="group block overflow-hidden rounded-xl border bg-card shadow-card">
            <PropertyImage src={opp.property_image} alt={opp.property_title} className="h-40 w-full" />
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{opp.property_code}</span>
                <PropertyStatusBadge value={opp.property_status} />
              </div>
              <div className="mt-1 text-sm font-semibold group-hover:text-primary">{opp.property_title}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" /> {lookups.district(opp.property_district)}
              </div>
              <div className="mt-2 text-sm font-semibold tabular">
                {formatMoney(opp.property_price, opp.property_currency)}
                {opp.operation === "rent" ? " /mes" : ""}
              </div>
            </div>
          </Link>

          <TasksList tasks={tasks} context={ctx} />
          <VisitsList visits={visits} context={ctx} />
        </aside>
      </div>
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-start gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
