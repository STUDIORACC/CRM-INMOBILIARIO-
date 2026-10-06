"use client";

import Link from "next/link";
import { useState } from "react";
import { LogOut, Menu, Settings, UserRound } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSession } from "@/components/providers/app-context";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ROLES, labelOf } from "@/lib/domain/constants";
import { AddMenu } from "./add-menu";
import { GlobalSearch } from "./global-search";
import { NotificationBell } from "./notification-bell";
import { BrandMark, SidebarNav, SidebarUser } from "./sidebar";

export function Topbar({ unread }: { unread: number }) {
  const session = useSession();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-5 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Abrir menú">
        <Menu className="size-5" />
      </Button>
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="flex w-[18rem] flex-col gap-0 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SheetDescription className="sr-only">Secciones del CRM</SheetDescription>
          <div className="flex h-16 items-center border-b px-5">
            <BrandMark />
          </div>
          <SidebarNav onNavigate={() => setNavOpen(false)} />
          <SidebarUser />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 items-center">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1.5">
        <AddMenu />
        <NotificationBell initialCount={unread} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ml-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Menú de usuario">
              <UserAvatar name={session.fullName} src={session.avatarUrl} size="md" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="truncate text-sm font-medium">{session.fullName}</div>
              <div className="truncate text-xs text-muted-foreground">{session.email}</div>
              <div className="mt-1 text-xs text-primary">{labelOf(ROLES, session.role)}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=profile">
                <UserRound /> Mi perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings /> Configuración
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={logoutAction}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  <LogOut /> Cerrar sesión
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
