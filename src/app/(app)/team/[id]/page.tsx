import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, Mail, Phone } from "lucide-react";
import { OptBadge } from "@/components/shared/badges";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { Breadcrumbs } from "@/components/shared/page-header";
import { PeriodFilter } from "@/components/shared/period-filter";
import { NoAccess } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/user-avatar";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs, getLookups } from "@/lib/catalogs";
import { withUser } from "@/lib/db";
import { ROLES } from "@/lib/domain/constants";
import { fmtDate, isPeriodKey, resolvePeriod, type PeriodKey } from "@/lib/domain/dates";
import { can } from "@/lib/domain/permissions";
import { formatPhone } from "@/lib/domain/phone";
import { getDashboard } from "@/lib/services/dashboard";
import { DashboardView } from "../../dashboard/dashboard-view";

export const metadata: Metadata = { title: "Vendedor" };
export const dynamic = "force-dynamic";

const PERIODS: PeriodKey[] = ["today", "week", "month", "last_month", "30d", "90d", "custom"];

export default async function TeamMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await requireSession();
  if (!can(session.role, "team.view")) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [catalogs, lookups] = await Promise.all([getCatalogs(), getLookups()]);
  const member = lookups.user(id);
  if (!member) notFound();
  const cur = catalogs.company.currency;

  const periodKey: PeriodKey = isPeriodKey(sp.period) ? sp.period : "30d";
  const period = resolvePeriod(periodKey, { from: sp.from, to: sp.to });
  const data = await withUser({ id: session.id, email: session.email }, (db) =>
    getDashboard(db, { period, ownerId: id, viewerId: id, currency: cur, usdRate: catalogs.company.usdRate }),
  );
  const profile = await withUser({ id: session.id, email: session.email }, (db) => db.one<{ email: string; phone: string | null; hired_at: string; status: string }>("select email, phone, hired_at, status from public.users where id = $1", [id]));

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Vendedores", href: "/team" }, { label: member.fullName }]} />
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar name={member.fullName} src={member.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{member.fullName}</h1>
              <OptBadge list={ROLES} value={member.role} />
              {profile?.status === "inactive" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Inactivo</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {profile?.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" /> {profile.email}
                </span>
              )}
              {profile?.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {formatPhone(profile.phone)}
                </span>
              )}
              {profile?.hired_at && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" /> En el equipo desde {fmtDate(profile.hired_at)}
                </span>
              )}
            </div>
          </div>
          <ContactButtons phone={profile?.phone} email={profile?.email} name={member.fullName} size="default" />
          <PeriodFilter options={PERIODS} value={period.key} from={period.fromDate} to={period.toDate} />
        </div>
      </div>
      <DashboardView data={data} period={period} cur={cur} global={false} ownerId={id} lookups={lookups} />
    </div>
  );
}
