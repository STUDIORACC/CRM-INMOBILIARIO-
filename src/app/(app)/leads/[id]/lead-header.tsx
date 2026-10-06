"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, CheckSquare, GitMerge, MoreHorizontal, Pencil, RotateCcw, StickyNote, Tag, Target, Trash2, UserCheck, UserRoundCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { assignLeadsAction, changeLeadStageAction, deleteLeadAction, reactivateLeadAction, setPriorityAction } from "@/actions/leads";
import { useCan, useSession } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { ConfirmDialog } from "@/components/shared/app-dialog";
import { ContactButtons } from "@/components/shared/contact-buttons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_STAGES, PRIORITIES } from "@/lib/domain/constants";
import { LeadStageBadge } from "@/components/shared/badges";
import type { LeadDetail } from "@/lib/services/leads";

export function LeadHeaderControls({ lead }: { lead: Pick<LeadDetail, "id" | "stage" | "priority" | "assigned_to" | "client_id"> }) {
  const [pending, start] = useTransition();
  const locked = lead.stage === "won" || lead.stage === "lost";
  const changeStage = (stage: string) =>
    start(async () => {
      const res = await changeLeadStageAction({ id: lead.id, stage: stage as never });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  const changePriority = (priority: string) =>
    start(async () => {
      const res = await setPriorityAction({ entity: "lead", id: lead.id, priority: priority as never });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {locked ? (
        <LeadStageBadge value={lead.stage} />
      ) : (
        <Select value={lead.stage} onValueChange={changeStage} disabled={pending}>
          <SelectTrigger size="sm" className="w-44 bg-white" aria-label="Etapa del lead">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STAGES.filter((s) => !["won", "lost"].includes(s.value)).map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={lead.priority} onValueChange={changePriority} disabled={pending || lead.stage === "lost"}>
        <SelectTrigger size="sm" className="w-36 bg-white" aria-label="Prioridad">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              Prioridad {p.label.toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function LeadActionBar({ lead }: { lead: LeadDetail }) {
  const { open } = useQuickActions();
  const router = useRouter();
  const session = useSession();
  const canAssign = useCan("leads.assign_any");
  const canDelete = useCan("leads.delete");
  const canOpp = useCan("opportunities.access");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canTake = !lead.assigned_to && !canAssign;
  const ctx = { leadId: lead.id, leadName: lead.full_name, propertyId: lead.property_id ?? undefined, propertyLabel: lead.property_code ? `${lead.property_code} · ${lead.property_title}` : undefined };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ContactButtons phone={lead.phone} email={lead.email} name={lead.full_name} leadId={lead.id} propertyId={lead.property_id ?? undefined} propertyLabel={ctx.propertyLabel} size="default" withLabels />
      <Button variant="outline" onClick={() => open("task", ctx)}>
        <CheckSquare /> Crear tarea
      </Button>
      <Button variant="outline" onClick={() => open("visit", ctx)} disabled={lead.stage === "lost"}>
        <CalendarPlus /> Agendar visita
      </Button>
      {canOpp && (
        <Button onClick={() => open("opportunity", ctx)} disabled={lead.stage === "lost"}>
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
          <DropdownMenuItem onSelect={() => open("lead", { leadId: lead.id })}>
            <Pencil /> Editar datos y calificación
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("activity", { ...ctx, type: "call" })}>
            <StickyNote /> Registrar actividad
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("tags", { entity: "lead", id: lead.id, current: lead.tags.map((t) => t.id) })}>
            <Tag /> Etiquetas
          </DropdownMenuItem>
          {(canAssign || canTake) && (
            <DropdownMenuItem
              onSelect={async () => {
                if (canTake) {
                  const res = await assignLeadsAction({ ids: [lead.id], userId: session.id });
                  if (res.ok) toast.success("Lead asignado a ti");
                  else toast.error(res.error);
                } else open("assign", { entity: "lead", ids: [lead.id], currentUserId: lead.assigned_to, label: lead.full_name });
              }}
            >
              <UserCheck /> {canTake ? "Tomar este lead" : "Asignar vendedor"}
            </DropdownMenuItem>
          )}
          {!lead.client_id && lead.stage !== "lost" && (
            <DropdownMenuItem onSelect={() => open("convert", { leadId: lead.id, leadName: lead.full_name })}>
              <UserRoundCheck /> Convertir en cliente
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem onSelect={() => open("merge", { leadId: lead.id, leadName: lead.full_name })}>
              <GitMerge /> Fusionar con otro lead
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {lead.stage === "lost" ? (
            <DropdownMenuItem
              onSelect={async () => {
                const res = await reactivateLeadAction({ id: lead.id });
                if (res.ok) toast.success(res.message);
                else toast.error(res.error);
              }}
            >
              <RotateCcw /> Reactivar lead
            </DropdownMenuItem>
          ) : (
            lead.stage !== "won" && (
              <DropdownMenuItem variant="destructive" onSelect={() => open("lost", { entity: "lead", id: lead.id, name: lead.full_name })}>
                <XCircle /> Marcar como perdido
              </DropdownMenuItem>
            )
          )}
          {canDelete && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Eliminar lead
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar este lead?"
        description={`Se eliminará "${lead.full_name}" con sus actividades y tareas. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar lead"
        destructive
        onConfirm={async () => {
          const res = await deleteLeadAction({ id: lead.id });
          if (res.ok) {
            toast.success(res.message);
            router.push("/leads");
          }
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      />
    </div>
  );
}
