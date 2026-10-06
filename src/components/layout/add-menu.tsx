"use client";

import { useRouter } from "next/navigation";
import { Building2, CalendarPlus, CheckSquare, Plus, Target, UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSession } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { can } from "@/lib/domain/permissions";

/** Botón "Agregar": acciones rápidas disponibles según el rol. */
export function AddMenu() {
  const { open } = useQuickActions();
  const router = useRouter();
  const session = useSession();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5">
          <Plus />
          <span className="hidden sm:inline">Agregar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Acciones rápidas</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => open("lead", {})}>
          <UserPlus /> Nuevo lead
        </DropdownMenuItem>
        {can(session.role, "properties.create") && (
          <DropdownMenuItem onSelect={() => router.push("/properties/new")}>
            <Building2 /> Nueva propiedad
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => open("client", {})}>
          <UserCheck /> Nuevo cliente
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => open("visit", {})}>
          <CalendarPlus /> Nueva visita
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open("task", {})}>
          <CheckSquare /> Nueva tarea
        </DropdownMenuItem>
        {can(session.role, "opportunities.access") && (
          <DropdownMenuItem onSelect={() => open("opportunity", {})}>
            <Target /> Nueva oportunidad
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
