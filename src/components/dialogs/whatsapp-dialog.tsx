"use client";

import { Loader2, MessageCircle, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { logActivityAction } from "@/actions/leads";
import { useCatalogs, useSession } from "@/components/providers/app-context";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_CATEGORIES, labelOf } from "@/lib/domain/constants";
import { fmtDate, fmtTime } from "@/lib/domain/dates";
import { fillTemplate } from "@/lib/domain/templates";
import { formatPhone, whatsappLink } from "@/lib/domain/phone";
import { cn } from "@/lib/utils";

/** Abre WhatsApp (wa.me) con un mensaje prellenado a partir de plantillas y deja constancia en el historial. */
export default function WhatsappDialog({ ctx, onClose }: DialogProps<"whatsapp">) {
  const session = useSession();
  const { templates, company } = useCatalogs();
  const wa = templates.filter((t) => t.channel === "whatsapp" && t.active);

  const vars = useMemo(
    () => ({
      nombre: ctx.name.split(" ")[0],
      asesor: session.fullName.split(" ")[0],
      empresa: company.name,
      propiedad: ctx.visit?.propertyTitle ?? ctx.propertyLabel?.split(" · ")[1] ?? ctx.propertyLabel ?? "la propiedad",
      codigo: ctx.visit?.propertyCode ?? ctx.propertyLabel?.split(" · ")[0] ?? "",
      precio: "",
      direccion: ctx.visit?.address ?? "",
      fecha: ctx.visit ? fmtDate(ctx.visit.dateIso) : "",
      hora: ctx.visit ? fmtTime(ctx.visit.dateIso) : "",
    }),
    [ctx, session.fullName, company.name],
  );

  const initialTemplate = wa.find((t) => t.category === (ctx.category ?? (ctx.visit ? "confirm_visit" : "first_contact"))) ?? wa[0];
  const [templateId, setTemplateId] = useState<string | null>(initialTemplate?.id ?? null);
  const [text, setText] = useState(initialTemplate ? fillTemplate(initialTemplate.body, vars) : `Hola ${vars.nombre}, `);
  const [log, setLog] = useState(Boolean(ctx.leadId || ctx.clientId || ctx.opportunityId));
  const [busy, setBusy] = useState(false);

  const link = whatsappLink(ctx.phone, text);

  const pick = (id: string) => {
    const t = wa.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setText(fillTemplate(t.body, vars));
  };

  const send = async () => {
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    if (log) {
      setBusy(true);
      const res = await logActivityAction({
        type: "whatsapp",
        title: "WhatsApp enviado",
        body: text.length > 400 ? `${text.slice(0, 400)}…` : text,
        direction: "outbound",
        responded: false,
        leadId: ctx.leadId ?? "",
        clientId: ctx.clientId ?? "",
        opportunityId: ctx.opportunityId ?? "",
        propertyId: ctx.propertyId ?? "",
        ownerId: "",
        followUpAt: "",
      });
      setBusy(false);
      if (!res.ok) toast.error(res.error);
      else toast.success("Mensaje registrado en el historial");
    }
    onClose();
  };

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Enviar por WhatsApp"
      description={`${ctx.name} · ${ctx.phone ? formatPhone(ctx.phone) : "sin teléfono"}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={!link || busy || text.trim().length === 0} className="bg-emerald-600 hover:bg-emerald-600/90">
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            Abrir WhatsApp
          </Button>
        </>
      }
    >
      <div>
        <div className="mb-1.5 text-[13px] font-medium">Plantilla</div>
        <div className="flex flex-wrap gap-1.5">
          {wa.map((t) => (
            <button key={t.id} type="button" onClick={() => pick(t.id)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", templateId === t.id ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "bg-white text-muted-foreground hover:bg-accent")} title={labelOf(TEMPLATE_CATEGORIES, t.category)}>
              {t.name}
            </button>
          ))}
          {wa.length === 0 && <span className="text-sm text-muted-foreground">No hay plantillas activas. Puedes escribir un mensaje libre.</span>}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[13px] font-medium">
          <span>Mensaje</span>
          <span className="text-xs font-normal text-muted-foreground">Edítalo antes de enviar</span>
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="text-sm" />
      </div>
      <div className="rounded-xl bg-[#e7f7ec] p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-800">
          <MessageCircle className="size-3.5" /> Vista previa
        </div>
        <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-white px-3 py-2 text-sm whitespace-pre-wrap shadow-sm">{text || "…"}</div>
      </div>
      {(ctx.leadId || ctx.clientId || ctx.opportunityId) && (
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox checked={log} onCheckedChange={(v) => setLog(v === true)} />
          Registrar este mensaje en el historial
        </label>
      )}
    </AppDialog>
  );
}
