"use client";

import { Button } from "@/components/ui/button";
import { useQuickActions } from "@/components/quick/quick-actions";
import type { DialogKind, DialogMap } from "@/components/quick/types";

/** Botón compacto que abre un diálogo de edición desde una página de servidor. */
export function EditButton({ kind, ctx, label, icon }: { kind: DialogKind; ctx: Record<string, string>; label: string; icon?: React.ReactNode }) {
  const { open } = useQuickActions();
  return (
    <Button variant="ghost" size="sm" onClick={() => open(kind, ctx as DialogMap[typeof kind])}>
      {icon}
      {label}
    </Button>
  );
}
