"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, CheckSquare, MoreHorizontal, Pencil, StickyNote, Tag, Target, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { deleteClientAction, setClientStatusAction } from "@/actions/clients";
import { useCan } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { ConfirmDialog } from "@/components/shared/app-dialog";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Props {
  client: { id: string; full_name: string; phone: string | null; email: string | null; status: string; assigned_to: string | null; tagIds: string[] };
}

export function ClientActionBar({ client }: Props) {
  const { open } = useQuickActions();
  const router = useRouter();
  const canAssign = useCan("leads.assign_any");
  const canDelete = useCan("clients.delete");
  const canOpp = useCan("opportunities.access");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ctx = { clientId: client.id, clientName: client.full_name };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ContactButtons phone={client.phone} email={client.email} name={client.full_name} clientId={client.id} size="default" withLabels />
      <Button variant="outline" onClick={() => open("task", ctx)}>
        <CheckSquare /> Crear tarea
      </Button>
      <Button variant="outline" onClick={() => open("visit", ctx)}>
        <CalendarPlus /> Agendar visita
      </Button>
      {canOpp && (
        <Button onClick={() => open("opportunity", ctx)}>
          <Target /> Crear oportunidad
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Más acciones">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => open("client", { clientId: client.id })}>
            <Pencil /> Editar datos y preferencias
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("activity", { ...ctx, type: "call" })}>
            <StickyNote /> Registrar actividad
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("tags", { entity: "client", id: client.id, current: client.tagIds })}>
            <Tag /> Etiquetas
          </DropdownMenuItem>
          {canAssign && (
            <DropdownMenuItem onSelect={() => open("assign", { entity: "client", ids: [client.id], currentUserId: client.assigned_to, label: client.full_name })}>
              <UserCheck /> Asignar asesor
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              const res = await setClientStatusAction({ id: client.id, status: client.status === "active" ? "inactive" : "active" });
              if (res.ok) toast.success(client.status === "active" ? "Cliente marcado como inactivo" : "Cliente reactivado");
              else toast.error(res.error);
            }}
          >
            <UserX /> {client.status === "active" ? "Marcar como inactivo" : "Reactivar cliente"}
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Eliminar cliente
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar este cliente?"
        description={`Se eliminará "${client.full_name}" y su historial. Solo es posible si no tiene oportunidades ni visitas.`}
        confirmLabel="Eliminar cliente"
        destructive
        onConfirm={async () => {
          const res = await deleteClientAction({ id: client.id });
          if (res.ok) {
            toast.success(res.message);
            router.push("/clients");
          }
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      />
    </div>
  );
}
