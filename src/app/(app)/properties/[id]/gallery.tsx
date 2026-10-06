"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Expand, ImagePlus, Link2, Loader2, Star, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addImageUrlAction, deleteImageAction, moveImageAction, setCoverAction, uploadPropertyImageAction } from "@/actions/properties";
import { AppDialog } from "@/components/shared/app-dialog";
import { PropertyImage } from "@/components/shared/property-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PropertyImageRow } from "@/lib/services/properties";
import { cn } from "@/lib/utils";

/** Galería con imagen principal, miniaturas y visor a pantalla completa. */
export function PropertyGallery({ images, title, canEdit, propertyId }: { images: PropertyImageRow[]; title: string; canEdit: boolean; propertyId: string }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState(false);
  const [manage, setManage] = useState(false);
  const count = images.length;
  const current = images[Math.min(index, Math.max(count - 1, 0))];

  const go = useCallback((d: number) => setIndex((i) => (count ? (i + d + count) % count : 0)), [count]);

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, go]);

  if (count === 0) {
    return (
      <div className="relative">
        <PropertyImage src={null} alt={title} className="aspect-[16/9] w-full rounded-2xl" />
        {canEdit && (
          <Button className="absolute right-3 bottom-3" onClick={() => setManage(true)}>
            <ImagePlus /> Agregar fotos
          </Button>
        )}
        {manage && <ImageManager images={images} propertyId={propertyId} onClose={() => setManage(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 lg:grid-cols-[1fr_16rem]">
        <button type="button" onClick={() => setViewer(true)} className="group relative block overflow-hidden rounded-2xl" aria-label="Ampliar imagen">
          <PropertyImage src={current.url} alt={current.caption ?? title} priority className="aspect-[16/10] w-full transition-transform duration-500 group-hover:scale-[1.02]" />
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
            <Expand className="size-3.5" /> {index + 1} / {count}
          </span>
          {current.caption && <span className="absolute bottom-3 left-3 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">{current.caption}</span>}
        </button>
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-2 lg:content-start">
          {images.slice(0, 6).map((img, i) => (
            <button key={img.id} type="button" onClick={() => setIndex(i)} className={cn("relative overflow-hidden rounded-xl ring-offset-2 transition", i === index ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100")} aria-label={`Ver imagen ${i + 1}`}>
              <PropertyImage src={img.url} alt="" className="aspect-[4/3] w-full" />
              {i === 5 && count > 6 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">+{count - 6}</span>}
            </button>
          ))}
          {canEdit && (
            <Button variant="outline" className="col-span-4 h-auto py-2 lg:col-span-2" onClick={() => setManage(true)}>
              <ImagePlus /> Administrar fotos
            </Button>
          )}
        </div>
      </div>

      <Dialog open={viewer} onOpenChange={setViewer}>
        <DialogContent showCloseButton={false} className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col items-center justify-center gap-0 rounded-none border-0 bg-black/95 p-0 text-white ring-0 sm:max-w-none">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">Galería de imágenes, usa las flechas para navegar</DialogDescription>
          <button type="button" onClick={() => setViewer(false)} className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Cerrar visor">
            <X className="size-5" />
          </button>
          {count > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} className="absolute left-3 z-10 rounded-full bg-white/10 p-3 hover:bg-white/20" aria-label="Imagen anterior">
                <ChevronLeft className="size-6" />
              </button>
              <button type="button" onClick={() => go(1)} className="absolute right-3 z-10 rounded-full bg-white/10 p-3 hover:bg-white/20" aria-label="Imagen siguiente">
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={current.caption ?? title} className="max-h-[82dvh] max-w-full object-contain" />
          <div className="mt-3 text-sm text-white/80">
            {current.caption ? `${current.caption} · ` : ""}
            {index + 1} / {count}
          </div>
        </DialogContent>
      </Dialog>
      {manage && <ImageManager images={images} propertyId={propertyId} onClose={() => setManage(false)} />}
    </div>
  );
}

function ImageManager({ images, propertyId, onClose }: { images: PropertyImageRow[]; propertyId: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, success?: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) toast.error(res.error);
    else if (success ?? res.message) toast.success(success ?? res.message);
    return res.ok;
  };

  const upload = async () => {
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return toast.error("Selecciona una o más imágenes");
    for (const file of files) {
      const fd = new FormData();
      fd.set("propertyId", propertyId);
      fd.set("file", file);
      const ok = await run("upload", () => uploadPropertyImageAction(fd), `“${file.name}” subida`);
      if (!ok) break;
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <AppDialog open onOpenChange={(o) => !o && onClose()} size="lg" title="Fotos de la propiedad" description="La primera imagen es la portada. Reordena, cambia la portada o elimina fotos." footer={<Button onClick={onClose}>Listo</Button>}>
      <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Subir archivos (JPG, PNG, WebP · máx. 10 MB)</div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary" />
          <Button size="sm" onClick={upload} disabled={busy === "upload"}>
            {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />} Subir
          </Button>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">O agregar desde un enlace</div>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/foto.jpg" inputMode="url" />
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Descripción (opcional)" maxLength={120} />
          <Button
            size="sm"
            variant="outline"
            disabled={!url.trim() || busy === "url"}
            onClick={async () => {
              const ok = await run("url", () => addImageUrlAction({ propertyId, url: url.trim(), caption }));
              if (ok) {
                setUrl("");
                setCaption("");
              }
            }}
          >
            {busy === "url" ? <Loader2 className="animate-spin" /> : <Link2 />} Agregar enlace
          </Button>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {images.map((img, i) => (
          <li key={img.id} className="flex gap-2.5 rounded-xl border p-2">
            <PropertyImage src={img.url} alt="" className="size-20 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div className="truncate text-xs text-muted-foreground">{img.caption ?? `Imagen ${i + 1}`}</div>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="icon-xs" variant={img.is_cover ? "default" : "outline"} aria-label={img.is_cover ? "Portada" : "Usar como portada"} title={img.is_cover ? "Portada" : "Usar como portada"} disabled={Boolean(busy) || img.is_cover} onClick={() => run(`c${img.id}`, () => setCoverAction({ propertyId, imageId: img.id }))}>
                  <Star />
                </Button>
                <Button size="icon-xs" variant="outline" aria-label="Subir posición" disabled={Boolean(busy) || i === 0} onClick={() => run(`u${img.id}`, () => moveImageAction({ propertyId, imageId: img.id, direction: -1 }))}>
                  <ArrowUp />
                </Button>
                <Button size="icon-xs" variant="outline" aria-label="Bajar posición" disabled={Boolean(busy) || i === images.length - 1} onClick={() => run(`d${img.id}`, () => moveImageAction({ propertyId, imageId: img.id, direction: 1 }))}>
                  <ArrowDown />
                </Button>
                <Button size="icon-xs" variant="destructive" aria-label="Eliminar imagen" className="ml-auto" disabled={Boolean(busy)} onClick={() => run(`x${img.id}`, () => deleteImageAction({ propertyId, imageId: img.id }))}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </AppDialog>
  );
}
