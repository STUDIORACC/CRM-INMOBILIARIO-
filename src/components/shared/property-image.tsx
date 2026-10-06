"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Imagen de propiedad con degradado de respaldo si la foto no carga (sin conexión, URL rota). */
export function PropertyImage({ src, alt, className, priority = false }: { src?: string | null; alt: string; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn("flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400", className)} role="img" aria-label={alt}>
        <Building2 className="size-1/3 min-h-4 min-w-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("bg-slate-100 object-cover", className)}
    />
  );
}
