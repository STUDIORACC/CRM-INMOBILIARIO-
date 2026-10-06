"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, MessageCircle, Pencil, Phone, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteOwnerAction } from "@/actions/clients";
import { useCan } from "@/components/providers/app-context";
import { useQuickActions } from "@/components/quick/quick-actions";
import { ConfirmDialog } from "@/components/shared/app-dialog";
import { Button } from "@/components/ui/button";
import { telLink, whatsappLink } from "@/lib/domain/phone";

export function OwnerActionBar({ owner }: { owner: { id: string; full_name: string; phone: string | null } }) {
  const { open } = useQuickActions();
  const router = useRouter();
  const canDelete = useCan("owners.delete");
  const canCreate = useCan("properties.create");
  const [confirm, setConfirm] = useState(false);
  const tel = telLink(owner.phone);
  const wa = whatsappLink(owner.phone, `Hola ${owner.full_name.split(" ")[0]}, te escribo de la inmobiliaria por tu propiedad.`);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" disabled={!tel} asChild={Boolean(tel)}>
        {tel ? (
          <a href={tel}>
            <Phone className="text-blue-600" /> Llamar
          </a>
        ) : (
          <span>
            <Phone /> Llamar
          </span>
        )}
      </Button>
      <Button variant="outline" disabled={!wa} asChild={Boolean(wa)}>
        {wa ? (
          <a href={wa} target="_blank" rel="noreferrer">
            <MessageCircle className="text-emerald-600" /> WhatsApp
          </a>
        ) : (
          <span>
            <MessageCircle /> WhatsApp
          </span>
        )}
      </Button>
      <Button variant="outline" onClick={() => open("activity", { ownerId: owner.id, type: "meeting" })}>
        <StickyNote /> Registrar reunión / nota
      </Button>
      {canCreate && (
        <Button asChild>
          <Link href="/properties/new">
            <Building2 /> Nueva propiedad
          </Link>
        </Button>
      )}
      <Button variant="ghost" size="icon" onClick={() => open("owner", { ownerId: owner.id })} aria-label="Editar propietario">
        <Pencil />
      </Button>
      {canDelete && (
        <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label="Eliminar propietario">
          <Trash2 className="text-destructive" />
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Eliminar propietario?"
        description={`Se eliminará a ${owner.full_name}. Solo es posible si no tiene propiedades asociadas.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          const res = await deleteOwnerAction({ id: owner.id });
          if (res.ok) {
            toast.success(res.message);
            router.push("/owners");
          }
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      />
    </div>
  );
}
