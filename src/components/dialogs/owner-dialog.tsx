"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createOwnerAction, updateOwnerAction } from "@/actions/clients";
import { getOwnerForEditAction } from "@/actions/queries";
import { Form, FormError, SelectField, SubmitButton, TextField, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import type { DialogProps } from "@/components/quick/types";
import { AppDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { DOC_TYPES, OWNER_TYPES } from "@/lib/domain/constants";
import { ownerSchema, type OwnerInput } from "@/lib/validation/clients";

export default function OwnerDialog({ ctx, onClose }: DialogProps<"owner">) {
  const editing = Boolean(ctx.ownerId);
  const [loading, setLoading] = useState(editing);
  const [initial, setInitial] = useState<OwnerInput | null>(null);
  useEffect(() => {
    if (!ctx.ownerId) return;
    getOwnerForEditAction({ id: ctx.ownerId }).then((r) => {
      if (r.ok) setInitial(r.data as OwnerInput);
      else {
        toast.error("No se pudo cargar el propietario");
        onClose();
      }
      setLoading(false);
    });
  }, [ctx.ownerId, onClose]);

  if (loading) {
    return (
      <AppDialog open onOpenChange={(o) => !o && onClose()} title="Editar propietario">
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      </AppDialog>
    );
  }
  return <OwnerForm key={ctx.ownerId ?? "new"} initial={initial} ownerId={ctx.ownerId} onClose={onClose} />;
}

function OwnerForm({ initial, ownerId, onClose }: { initial: OwnerInput | null; ownerId?: string; onClose: () => void }) {
  const router = useRouter();
  const editing = Boolean(ownerId);
  const { form, submit, formError, submitting } = useActionForm({
    schema: ownerSchema,
    defaultValues: initial ?? { fullName: "", docType: "dni", docNumber: "", phone: "", email: "", address: "", ownerType: "individual", notes: "" },
    action: (v) => (editing ? updateOwnerAction({ id: ownerId!, owner: v }) : createOwnerAction(v)),
    onSuccess: (data) => {
      onClose();
      const r = data as { id?: string } | undefined;
      if (r?.id && !editing) router.push(`/owners/${r.id}`);
    },
    successMessage: editing ? "Propietario actualizado" : "Propietario creado",
  });

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Editar propietario" : "Nuevo propietario"}
      description="Datos de contacto del dueño del inmueble. Luego podrás asociarle propiedades."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="owner-form" loading={submitting}>
            {editing ? "Guardar cambios" : "Crear propietario"}
          </SubmitButton>
        </>
      }
    >
      <Form id="owner-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="fullName" label="Nombre o razón social" required autoFocus className="sm:col-span-2" />
          <SelectField name="ownerType" label="Tipo de propietario" required options={OWNER_TYPES.map((o) => ({ value: o.value, label: o.label }))} />
          <SelectField name="docType" label="Documento" options={DOC_TYPES.map((d) => ({ value: d.value, label: d.label }))} allowEmpty emptyLabel="Sin documento" />
          <TextField name="docNumber" label="Número de documento (DNI / RUC)" inputMode="numeric" />
          <TextField name="phone" label="Teléfono" inputMode="tel" />
          <TextField name="email" label="Correo electrónico" type="email" className="sm:col-span-2" />
          <TextField name="address" label="Dirección" className="sm:col-span-2" />
        </div>
        <TextareaField name="notes" label="Notas" rows={3} placeholder="Disponibilidad, condiciones, exclusividad, representante legal…" />
      </Form>
    </AppDialog>
  );
}
