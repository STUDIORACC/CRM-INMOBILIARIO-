"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClientAction, updateClientAction } from "@/actions/clients";
import { getClientForEditAction } from "@/actions/queries";
import { ChipsField, Form, FormError, SelectField, SubmitButton, TextField, TextareaField } from "@/components/forms/fields";
import { SearchProfileFields } from "@/components/forms/search-profile-fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCan, useCatalogs, useSession } from "@/components/providers/app-context";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { DOC_TYPES } from "@/lib/domain/constants";
import type { DuplicateMatch } from "@/lib/services/leads";
import { clientSchema, type ClientInput } from "@/lib/validation/clients";
import { DuplicatePanel } from "./duplicate-panel";

const EMPTY: ClientInput = {
  fullName: "",
  docType: "dni",
  docNumber: "",
  phone: "",
  email: "",
  address: "",
  source: "",
  assignedTo: "",
  searchNotes: "",
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

export default function ClientDialog({ ctx, onClose }: DialogProps<"client">) {
  const editing = Boolean(ctx.clientId);
  const [loading, setLoading] = useState(editing);
  const [initial, setInitial] = useState<ClientInput | null>(null);
  useEffect(() => {
    if (!ctx.clientId) return;
    getClientForEditAction({ id: ctx.clientId }).then((r) => {
      if (r.ok) setInitial(r.data as ClientInput);
      else {
        toast.error("No se pudo cargar el cliente");
        onClose();
      }
      setLoading(false);
    });
  }, [ctx.clientId, onClose]);

  if (loading) {
    return (
      <AppDialog open onOpenChange={(o) => !o && onClose()} size="lg" title="Editar cliente">
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      </AppDialog>
    );
  }
  return <ClientForm key={ctx.clientId ?? "new"} initial={initial} ctx={ctx} onClose={onClose} />;
}

function ClientForm({ initial, ctx, onClose }: { initial: ClientInput | null; ctx: DialogProps<"client">["ctx"]; onClose: () => void }) {
  const router = useRouter();
  const session = useSession();
  const { users, sources, tags } = useCatalogs();
  const canAssign = useCan("leads.assign_any");
  const editing = Boolean(ctx.clientId);
  const modeRef = useRef<"check" | "create">("check");
  const [dups, setDups] = useState<DuplicateMatch[] | null>(null);

  const { form, submit, formError, submitting } = useActionForm({
    schema: clientSchema,
    defaultValues: initial ?? { ...EMPTY, assignedTo: session.role === "advisor" ? session.id : "" },
    action: (client) => (editing ? updateClientAction({ id: ctx.clientId!, client }) : createClientAction({ client, duplicateMode: modeRef.current })),
    onFailure: (res) => {
      if (res.code === "duplicate") {
        setDups(res.details as DuplicateMatch[]);
        return true;
      }
      return false;
    },
    onSuccess: (data) => {
      onClose();
      const r = data as { id?: string } | undefined;
      if (r?.id && !editing) router.push(`/clients/${r.id}`);
    },
    successMessage: editing ? "Cliente actualizado" : "Cliente creado",
  });

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={editing ? "Editar cliente" : "Nuevo cliente"}
      description="Registra sus datos y qué está buscando: con eso el CRM sugiere propiedades compatibles."
      footer={
        dups ? undefined : (
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <SubmitButton form="client-form" loading={submitting}>
              {editing ? "Guardar cambios" : "Crear cliente"}
            </SubmitButton>
          </>
        )
      }
    >
      {dups && (
        <DuplicatePanel
          entityLabel="cliente"
          matches={dups}
          busy={submitting}
          onCreate={() => {
            modeRef.current = "create";
            setDups(null);
            void submit();
          }}
          onCancel={onClose}
        />
      )}
      <Form id="client-form" form={form} onSubmit={(e) => { modeRef.current = "check"; setDups(null); return submit(e); }} className={dups ? "hidden" : "space-y-5"}>
        <FormError message={formError} />
        <section className="grid gap-4 sm:grid-cols-2">
          <TextField name="fullName" label="Nombre completo" required autoFocus placeholder="Ej. Valeria Torres" className="sm:col-span-2" />
          <SelectField name="docType" label="Tipo de documento" options={DOC_TYPES.map((d) => ({ value: d.value, label: d.label }))} allowEmpty emptyLabel="Sin documento" />
          <TextField name="docNumber" label="Número de documento" inputMode="numeric" />
          <TextField name="phone" label="Teléfono / WhatsApp" inputMode="tel" placeholder="987 654 321" />
          <TextField name="email" label="Correo electrónico" type="email" />
          <TextField name="address" label="Dirección" className="sm:col-span-2" />
          <SelectField name="source" label="Origen" options={sources.filter((s) => s.active).map((s) => ({ value: s.key, label: s.label }))} allowEmpty emptyLabel="Sin especificar" />
          {(canAssign || editing) && <SelectField name="assignedTo" label="Asesor asignado" options={[{ value: "", label: "Sin asignar" }, ...users.filter((u) => u.status === "active" && u.role !== "assistant").map((u) => ({ value: u.id, label: u.fullName }))]} disabled={!canAssign} />}
        </section>
        <section className="space-y-4 rounded-xl border p-4">
          <div>
            <h3 className="text-sm font-semibold">¿Qué está buscando?</h3>
            <p className="text-xs text-muted-foreground">Estas preferencias alimentan el matching de propiedades.</p>
          </div>
          <SearchProfileFields />
          <TextField name="purchaseDate" label="Fecha estimada de compra" type="date" />
          <TextareaField name="searchNotes" label="Notas de la búsqueda" rows={2} placeholder="Preferencias adicionales: vista, piso, mascotas, colegios cercanos…" />
        </section>
        {tags.length > 0 && <ChipsField name="tagIds" label="Etiquetas" options={tags.map((t) => ({ value: t.id, label: t.name }))} />}
      </Form>
    </AppDialog>
  );
}
