"use client";

import { FileSpreadsheet, FileText, FileType2, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { deleteDocumentAction, uploadDocumentAction } from "@/actions/documents";
import { useCan } from "@/components/providers/app-context";
import { AppDialog, ConfirmDialog } from "@/components/shared/app-dialog";
import { OptBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCUMENT_CATEGORIES } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import type { DocumentRow } from "@/lib/services/documents";

function iconFor(mime: string | null) {
  if (!mime) return FileText;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("sheet") || mime.includes("excel")) return FileSpreadsheet;
  if (mime.includes("word")) return FileType2;
  return FileText;
}

const size = (b: number | null) => (b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export type DocScope = { ownerId: string } | { clientId: string } | { propertyId: string } | { leadId: string };

/** Documentación básica adjunta (identidad, contratos, planos…). */
export function DocumentsPanel({ documents, scope, title = "Documentos" }: { documents: DocumentRow[]; scope: DocScope; title?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("other");
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canDelete = useCan("leads.delete");

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Selecciona un archivo");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("category", category);
    for (const [k, v] of Object.entries(scope)) fd.set(k, v);
    setBusy(true);
    const res = await uploadDocumentAction(fd);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(res.message);
    setOpen(false);
  };

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="size-4 text-muted-foreground" />
          {title}
          {documents.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{documents.length}</span>}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Upload /> Adjuntar
        </Button>
      </header>
      <div className="px-5 pb-4">
        {documents.length === 0 ? (
          <EmptyState compact icon={<Paperclip className="size-5" />} title="Sin documentos adjuntos" description="Sube DNI, contratos, autorizaciones o planos (PDF, imágenes, Word, Excel · máx. 10 MB)." />
        ) : (
          <ul className="divide-y">
            {documents.map((d) => {
              const Icon = iconFor(d.mime_type);
              return (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <a href={`/api/documents/${d.id}`} className="block truncate text-sm font-medium hover:text-primary" download>
                      {d.name}
                    </a>
                    <div className="text-xs text-muted-foreground">
                      {size(d.size_bytes)} · {d.uploader ?? "—"} · {fmtDate(d.created_at)}
                    </div>
                  </div>
                  <OptBadge list={DOCUMENT_CATEGORIES} value={d.category} dot={false} className="hidden sm:inline-flex" />
                  {(canDelete || true) && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${d.name}`} onClick={() => setToDelete(d)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {open && (
        <AppDialog
          open
          onOpenChange={setOpen}
          size="sm"
          title="Adjuntar documento"
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={upload} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Upload />} Subir
              </Button>
            </>
          }
        >
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Archivo</label>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/15" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Categoría</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </AppDialog>
      )}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="¿Eliminar documento?"
        description={`Se eliminará "${toDelete?.name}" de forma permanente.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          const res = await deleteDocumentAction({ id: toDelete!.id });
          if (res.ok) toast.success(res.message);
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      />
    </section>
  );
}
