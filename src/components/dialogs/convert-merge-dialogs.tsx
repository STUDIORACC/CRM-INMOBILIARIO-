"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { convertLeadAction, mergeLeadsAction } from "@/actions/leads";
import { EntityCombobox } from "@/components/forms/entity-field";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog, ConfirmDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";

export function ConvertDialog({ ctx, onClose }: DialogProps<"convert">) {
  const router = useRouter();
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="¿Convertir en cliente?"
      description={`${ctx.leadName} pasará a la base de clientes con su calificación y etiquetas. El lead conserva su historial y se vincula al cliente.`}
      confirmLabel="Convertir en cliente"
      onConfirm={async () => {
        const res = await convertLeadAction({ id: ctx.leadId });
        if (!res.ok) return { ok: false, error: res.error };
        toast.success(res.message);
        onClose();
        router.push(`/clients/${res.data.clientId}`);
      }}
    />
  );
}

export function MergeDialog({ ctx, onClose }: DialogProps<"merge">) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);

  const merge = async () => {
    setBusy(true);
    const res = await mergeLeadsAction({ sourceId: ctx.leadId, targetId });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message);
    onClose();
    router.push(`/leads/${targetId}`);
  };

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Fusionar con otro lead"
      description={`"${ctx.leadName}" se fusionará en el lead que elijas y dejará de existir como registro separado.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={merge} disabled={!targetId || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <GitMerge />} Fusionar
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label className="text-[13px] font-medium">Lead principal (se conserva)</label>
        <EntityCombobox kind="lead" value={targetId} onChange={(id) => setTargetId(id)} placeholder="Buscar el lead principal…" />
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Actividades, tareas, visitas, oportunidades y notas se mueven al lead principal.</li>
        <li>Se completan los datos que le falten (teléfono, email, presupuesto…).</li>
        <li>Esta acción no se puede deshacer.</li>
      </ul>
    </AppDialog>
  );
}
