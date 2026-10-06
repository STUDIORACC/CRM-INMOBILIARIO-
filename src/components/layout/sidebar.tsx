"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCatalogs, useSession } from "@/components/providers/app-context";
import { UserAvatar } from "@/components/shared/user-avatar";
import { can } from "@/lib/domain/permissions";
import { ROLES, labelOf } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import { NAV } from "./nav-config";
import { useNotificationCount } from "./notification-bell";

export function BrandMark({ className }: { className?: string }) {
  const { company } = useCatalogs();
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {company.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={company.logoUrl} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{company.name.slice(0, 1)}</div>
      )}
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold">{company.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">CRM Inmobiliario</div>
      </div>
    </div>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const session = useSession();
  const unread = useNotificationCount();

  return (
    <nav aria-label="Navegación principal" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.capability || can(session.role, i.capability));
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group.label}</div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.href === "/notifications" && unread > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground tabular">{unread > 99 ? "99+" : unread}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function SidebarUser() {
  const session = useSession();
  return (
    <div className="border-t p-3">
      <Link href="/settings" className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-muted">
        <UserAvatar name={session.fullName} src={session.avatarUrl} size="md" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-medium">{session.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{labelOf(ROLES, session.role)}</div>
        </div>
      </Link>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-16 items-center border-b px-5">
        <BrandMark />
      </div>
      <SidebarNav />
      <SidebarUser />
    </aside>
  );
}
