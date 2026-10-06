"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { useWatch } from "react-hook-form";
import { createLeadAction, findDuplicatesAction, updateLeadAction } from "@/actions/leads";
import { getLeadForEditAction } from "@/actions/queries";
import { Button } from "@/components/ui/button";
import { EntityField } from "@/components/forms/entity-field";
import { ChipsField, Form, FormError, SelectField, SubmitButton, TextField, TextareaField } from "@/components/forms/fields";
import { SearchProfileFields } from "@/components/forms/search-profile-fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs, useCan, useSession } from "@/components/providers/app-context";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { DuplicatePanel } from "./duplicate-panel";
import { INTEREST_LEVELS, PRIORITIES } from "@/lib/domain/constants";
import type { DuplicateMatch } from "@/lib/services/leads";
import { leadSchema, type LeadInput } from "@/lib/validation/leads";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "sonner";

type FormValues = LeadInput;

const EMPTY: FormValues = {
  fullName: "",
  phone: "",
  email: "",
  source: "whatsapp",
  priority: "medium",
  assignedTo: "",
  propertyId: "",
  message: "",
  interestLevel: "",
  purchaseDate: "",
  tagIds: [],
  operationType: "",
  propertyType: "",
  budgetMin: null,
  budgetMax: null,
  currency: "PEN",
  districts: [],
  bedroomsMin: null,
  bathroomsMin: null,
  areaMin: null,
  areaMax: null,
  financing: "",
};

export default function LeadDialog({ ctx, onClose }: DialogProps<"lead">) {
  const editing = Boolean(ctx.leadId);
  const [loading, setLoading] = useState(editing);
  const [initial, setInitial] = useState<(FormValues & { propertyLabel?: string }) | null>(null);

  useEffect(() => {
    if (!ctx.leadId) return;
    getLeadForEditAction({ id: ctx.leadId }).then((res) => {
      if (res.ok) setInitial(res.data as FormValues & { propertyLabel?: string });
      else {
        toast.error("No se pudo cargar el lead");
        onClose();
      }
      setLoading(false);
    });
  }, [ctx.leadId, onClose]);

  if (loading) {
    return (
      <AppDialog open onOpenChange={(o) => !o && onClose()} size="lg" title="Editar lead">
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      </AppDialog>
    );
  }
  return <LeadForm key={ctx.leadId ?? "new"} ctx={ctx} initial={initial} onClose={onClose} />;
}

function LeadForm({ ctx, initial, onClose }: { ctx: DialogProps<"lead">["ctx"]; initial: (FormValues & { propertyLabel?: string }) | null; onClose: () => void }) {
  const router = useRouter();
  const session = useSession();
  const { sources, users, tags } = useCatalogs();
  const canAssign = useCan("leads.assign_any");
  const editing = Boolean(ctx.leadId);
  const modeRef = useRef<string>("check");
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [showProfile, setShowProfile] = useState(editing);

  const defaults: FormValues = initial ?? { ...EMPTY, assignedTo: session.role === "advisor" ? session.id : "", propertyId: ctx.propertyId ?? "" };

  const { form, submit, formError, submitting } = useActionForm({
    schema: leadSchema,
    defaultValues: defaults,
    action: (lead) => (editing ? updateLeadAction({ id: ctx.leadId!, lead }) : createLeadAction({ lead, duplicateMode: modeRef.current })),
    onFailure: (res) => {
      if (res.code === "duplicate") {
        setDuplicates(res.details as DuplicateMatch[]);
        return true;
      }
      return false;
    },
    onSuccess: (data) => {
      onClose();
      const result = data as { id?: string; merged?: boolean } | undefined;
      if (result?.id && !editing) router.push(`/leads/${result.id}`);
    },
    successMessage: editing ? "Lead actualizado" : "Lead creado",
  });

  // Detección temprana de duplicados mientras se escribe (solo en altas)
  const phone = useWatch({ control: form.control, name: "phone" }) as string;
  const email = useWatch({ control: form.control, name: "email" }) as string;
  const debounced = useDebouncedValue(`${phone}|${email}`, 600);
  const [softResult, setSoftResult] = useState<DuplicateMatch[]>([]);
  const [dp, de] = debounced.split("|");
  const okPhone = (dp ?? "").replace(/\D/g, "").length >= 7;
  const okEmail = /^\S+@\S+\.\S+$/.test(de ?? "");
  // Sin datos de contacto válidos no hay coincidencias que mostrar
  const soft = !editing && (okPhone || okEmail) ? softResult : [];
  useEffect(() => {
    if (editing || (!okPhone && !okEmail)) return;
    let alive = true;
    findDuplicatesAction({ phone: okPhone ? dp : undefined, email: okEmail ? de : undefined }).then((r) => alive && r.ok && setSoftResult(r.data));
    return () => {
      alive = false;
    };
  }, [dp, de, okPhone, okEmail, editing]);

  const send = (mode: string) => {
    modeRef.current = mode;
    setDuplicates(null);
    void submit();
  };

  const assignOptions = [{ value: "", label: "Sin asignar" }, ...users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))];

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={editing ? "Editar lead" : "Nuevo lead"}
      description={editing ? "Actualiza los datos de contacto y la calificación." : "Registra el contacto; el sistema te avisará si ya existe."}
      footer={
        duplicates ? undefined : (
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <SubmitButton form="lead-form" loading={submitting}>
              {editing ? "Guardar cambios" : "Crear lead"}
            </SubmitButton>
          </>
        )
      }
    >
      {duplicates && (
        <DuplicatePanel
          matches={duplicates}
          busy={submitting}
          onMerge={(m) => send(`merge:${m.kind}:${m.id}`)}
          onCreate={() => send("create")}
          onCancel={onClose}
        />
      )}
      <Form id="lead-form" form={form} onSubmit={(e) => { modeRef.current = editing ? "create" : "check"; setDuplicates(null); return submit(e); }} className={duplicates ? "hidden" : "space-y-5"}>
        <FormError message={formError} />

        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="fullName" label="Nombre completo" placeholder="Ej. Carlos Mendoza" required autoFocus autoComplete="off" className="sm:col-span-2" />
            <TextField name="phone" label="Teléfono / WhatsApp" placeholder="987 654 321" inputMode="tel" autoComplete="off" />
            <TextField name="email" label="Correo electrónico" type="email" placeholder="nombre@correo.com" autoComplete="off" />
          </div>
          {soft.length > 0 && !duplicates && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <b>Posible lead duplicado.</b> Ya existe {soft[0].kind === "lead" ? "el lead" : "el cliente"} <b>{soft[0].full_name}</b> con {soft[0].phone_match ? "el mismo teléfono" : "el mismo correo"}
                {soft[0].assigned_name ? ` (asignado a ${soft[0].assigned_name})` : ""}. Al guardar podrás revisarlo o fusionarlo.
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <SelectField name="source" label="Fuente" required options={sources.filter((s) => s.active).map((s) => ({ value: s.key, label: s.label }))} />
          <SelectField name="priority" label="Prioridad" required options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
          {(canAssign || editing) && <SelectField name="assignedTo" label="Vendedor asignado" options={assignOptions} disabled={!canAssign} hint={!canAssign ? "Solo gerencia puede reasignar" : undefined} />}
          <SelectField name="interestLevel" label="Nivel de interés" options={INTEREST_LEVELS.map((p) => ({ value: p.value, label: p.label }))} allowEmpty emptyLabel="Sin definir" />
          <EntityField name="propertyId" kind="property" label="Propiedad de interés" initialLabel={initial?.propertyLabel ?? ctx.propertyLabel} filters={{ status: "available" }} className="sm:col-span-2" />
          <TextareaField name="message" label="Mensaje o consulta inicial" rows={2} placeholder="Lo que escribió el cliente o notas del primer contacto" className="sm:col-span-2" />
        </section>

        <section className="rounded-xl border">
          <button type="button" onClick={() => setShowProfile((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left" aria-expanded={showProfile}>
            <span>
              <span className="block text-sm font-semibold">Calificación del lead</span>
              <span className="block text-xs text-muted-foreground">Presupuesto, zona y necesidades: mejora el scoring y el matching de propiedades</span>
            </span>
            <ChevronDown className={`size-4 transition-transform ${showProfile ? "rotate-180" : ""}`} />
          </button>
          {showProfile && (
            <div className="space-y-4 border-t px-4 py-4">
              <SearchProfileFields />
              <TextField name="purchaseDate" label="Fecha estimada de compra" type="date" />
            </div>
          )}
        </section>

        {tags.length > 0 && <ChipsField name="tagIds" label="Etiquetas" options={tags.map((t) => ({ value: t.id, label: t.name }))} />}

      </Form>
    </AppDialog>
  );
}
