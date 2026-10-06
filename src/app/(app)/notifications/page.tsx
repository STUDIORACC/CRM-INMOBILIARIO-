import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationBar } from "@/components/shared/pagination-bar";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { listNotifications } from "@/lib/services/notifications";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/domain/notification-types";
import { NotificationsView } from "./notifications-view";

export const metadata: Metadata = { title: "Notificaciones" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const view = sp.view === "unread" ? "unread" : "all";
  const type = sp.type && sp.type in NOTIFICATION_TYPE_LABELS ? sp.type : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { items, total, unread } = await withUser({ id: session.id, email: session.email }, (db) =>
    listNotifications(db, session.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, unreadOnly: view === "unread", type }),
  );

  return (
    <>
      <PageHeader title="Notificaciones" description="Alertas de seguimiento, visitas próximas y movimientos de tus oportunidades. Se generan automáticamente según tu configuración." />
      <NotificationsView items={items} unread={unread} view={view} type={type ?? ""} total={total} />
      {total > PAGE_SIZE && (
        <div className="mt-4">
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} />
        </div>
      )}
    </>
  );
}
