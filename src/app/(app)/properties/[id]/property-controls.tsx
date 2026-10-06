"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarPlus, DollarSign, MessageSquare, MoreHorizontal, Pencil, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { changePriceAction, changePropertyStateAction, deletePropertyAction } from "@/actions/properties";
import { getInterestedPartiesAction } from "@/actions/matching";
import { Form, FormError, NumberField, SubmitButton } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCan, useLookups } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { AppDialog, ConfirmDialog } from "@/components/shared/app-dialog";
import { ScorePill } from "@/components/matching/match-suggestions";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROPERTY_STATUSES, PUBLICATION_STATUSES, type Currency } from "@/lib/domain/constants";
import { formatMoney } from "@/lib/domain/money";
import type { InterestedParty } from "@/lib/services/matching";
import { priceChangeSchema } from "@/lib/validation/properties";
import { Users } from "lucide-react";

interface Prop {
  id: string;
  code: string;
  title: string;
  price: number;
  min_price: number | null;
  currency: Currency;
  status: string;
  publication_status: string;
  advisor_id: string | null;
  operation: string;
}

export function PropertyActions({ p, canEdit, canFinancials }: { p: Prop; canEdit: boolean; canFinancials: boolean }) {
  const router = useRouter();
  const { open } = useQuickActions();
  const canDelete = useCan("properties.delete");
  const canReassign = useCan("properties.edit_any");
  const [pending, start] = useTransition();
  const [priceOpen, setPriceOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const label = `${p.code} · ${p.title}`;

  const change = (patch: { status?: string; publicationStatus?: string }) =>
    start(async () => {
      const res = await changePropertyStateAction({ id: p.id, ...(patch as { status?: "available"; publicationStatus?: "published" }) });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && (
        <>
          <Select value={p.status} onValueChange={(v) => change({ status: v })} disabled={pending}>
            <SelectTrigger size="sm" className="w-40 bg-white" aria-label="Estado comercial">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={p.publication_status} onValueChange={(v) => change({ publicationStatus: v })} disabled={pending}>
            <SelectTrigger size="sm" className="w-44 bg-white" aria-label="Estado de publicación">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLICATION_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  Publicación: {s.label.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
      <Button variant="outline" onClick={() => open("visit", { propertyId: p.id, propertyLabel: label })} disabled={["sold", "rented", "withdrawn"].includes(p.status)}>
        <CalendarPlus /> Agendar visita
      </Button>
      <Button variant="outline" onClick={() => open("lead", { propertyId: p.id, propertyLabel: label })}>
        <MessageSquare /> Registrar consulta
      </Button>
      {canEdit && (
        <Button asChild>
          <Link href={`/properties/${p.id}/edit`}>
            <Pencil /> Editar
          </Link>
        </Button>
      )}
      {(canEdit || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Más acciones">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEdit && canFinancials && (
              <DropdownMenuItem onSelect={() => setPriceOpen(true)}>
                <DollarSign /> Cambiar precio
              </DropdownMenuItem>
            )}
            {canReassign && (
              <DropdownMenuItem onSelect={() => open("assign", { entity: "property", ids: [p.id], currentUserId: p.advisor_id, label })}>
                <UserCheck /> Cambiar asesor
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Eliminar propiedad
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {priceOpen && <PriceDialog p={p} onClose={() => setPriceOpen(false)} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar la propiedad?"
        description={`Se eliminará ${label} con sus fotos e historial de precios. Si tiene oportunidades asociadas no podrá eliminarse (retírala en su lugar).`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          const res = await deletePropertyAction({ id: p.id });
          if (res.ok) {
            toast.success(res.message);
            router.push("/properties");
          }
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      />
    </div>
  );
}

function PriceDialog({ p, onClose }: { p: Prop; onClose: () => void }) {
  const symbol = p.currency === "USD" ? "US$" : "S/";
  const { form, submit, formError, submitting } = useActionForm({
    schema: priceChangeSchema.omit({ id: true }),
    defaultValues: { price: p.price, minPrice: p.min_price },
    action: (v) => changePriceAction({ ...v, id: p.id, price: v.price as number }),
    onSuccess: onClose,
  });
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Cambiar precio"
      description={`${p.code} · el cambio queda registrado en el historial de precios y en la auditoría.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="price-form" loading={submitting}>
            Guardar precio
          </SubmitButton>
        </>
      }
    >
      <Form id="price-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <NumberField name="price" label={`Precio de lista${p.operation === "rent" ? " (mensual)" : ""}`} required prefix={symbol} />
        <NumberField name="minPrice" label="Precio mínimo negociable" prefix={symbol} hint="Solo visible para el equipo comercial" />
        <p className="text-xs text-muted-foreground">Precio actual: {formatMoney(p.price, p.currency)}</p>
      </Form>
    </AppDialog>
  );
}

/** Matching inverso: leads y clientes cuya búsqueda coincide con esta propiedad. */
export function InterestedParties({ propertyId, propertyLabel }: { propertyId: string; propertyLabel: string }) {
  const lookups = useLookups();
  const { open } = useQuickActions();
  const [state, setState] = useState<{ loading: boolean; items: InterestedParty[] }>({ loading: true, items: [] });
  useEffect(() => {
    getInterestedPartiesAction({ propertyId }).then((r) => setState({ loading: false, items: r.ok ? r.data : [] }));
  }, [propertyId]);

  if (state.loading) return <div className="py-10 text-center text-sm text-muted-foreground">Buscando interesados compatibles…</div>;
  if (state.items.length === 0) return <EmptyState compact icon={<Users className="size-5" />} title="Ningún lead o cliente coincide con esta propiedad" description="Cuando alguien busque algo similar aparecerá aquí para que le envíes la propiedad." />;
  return (
    <ul className="divide-y">
      {state.items.map((it) => (
        <li key={`${it.kind}-${it.id}`} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <Link href={it.kind === "lead" ? `/leads/${it.id}` : `/clients/${it.id}`} className="text-sm font-semibold hover:text-primary">
              {it.name}
            </Link>
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{it.kind === "lead" ? "Lead" : "Cliente"}</span>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Asesor: {lookups.userName(it.assigned_to)} · {it.reasons.filter((r) => r.status === "match").map((r) => r.label.toLowerCase()).join(", ") || "coincidencia parcial"}
            </div>
          </div>
          <ScorePill score={it.score} />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!it.phone}
              onClick={() =>
                open("whatsapp", {
                  phone: it.phone,
                  name: it.name,
                  leadId: it.kind === "lead" ? it.id : undefined,
                  clientId: it.kind === "client" ? it.id : undefined,
                  propertyId,
                  propertyLabel,
                  category: "send_properties",
                })
              }
            >
              Enviar propiedad
            </Button>
            <Button size="sm" variant="ghost" onClick={() => open("visit", { leadId: it.kind === "lead" ? it.id : undefined, clientId: it.kind === "client" ? it.id : undefined, leadName: it.name, clientName: it.name, propertyId, propertyLabel })}>
              Visita
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

