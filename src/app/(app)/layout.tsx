import { after } from "next/server";
import { AppProvider } from "@/components/providers/app-context";
import { QuickActionsProvider } from "@/components/quick/quick-actions";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireSession } from "@/lib/auth/session";
import { getCatalogs } from "@/lib/catalogs";
import { withAdmin, withUser } from "@/lib/db";
import { syncAlertNotifications } from "@/lib/services/alerts";
import { unreadCount } from "@/lib/services/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [catalogs, unread] = await Promise.all([
    getCatalogs(),
    withUser({ id: session.id, email: session.email }, (db) => unreadCount(db, session.id)),
  ]);

  // Alertas por tiempo (tareas vencidas, visitas próximas…): se evalúan como mucho cada 10 min
  after(async () => {
    try {
      await withAdmin((db) => syncAlertNotifications(db));
    } catch (err) {
      console.error("[alerts] sync falló:", err);
    }
  });

  return (
    <AppProvider
      session={{ id: session.id, fullName: session.fullName, email: session.email, role: session.role, avatarUrl: session.avatarUrl, phone: session.phone }}
      catalogs={catalogs}
    >
      <QuickActionsProvider>
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar unread={unread} />
            <main id="main" className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
              {children}
            </main>
          </div>
        </div>
      </QuickActionsProvider>
    </AppProvider>
  );
}
