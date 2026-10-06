"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickActions } from "@/components/quick/quick-actions";
import type { DialogKind, DialogMap } from "@/components/quick/types";

/** Botón que abre un diálogo de acción rápida. */
export function OpenDialogButton<K extends DialogKind>({
  kind,
  ctx,
  children,
  variant = "default",
  size = "default",
  icon = true,
  className,
}: {
  kind: K;
  ctx?: DialogMap[K];
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  icon?: boolean;
  className?: string;
}) {
  const { open } = useQuickActions();
  return (
    <Button variant={variant} size={size} className={className} onClick={() => open(kind, ctx)}>
      {icon && <Plus />}
      {children}
    </Button>
  );
}
