"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DIALOG_REGISTRY } from "./registry";
import type { DialogKind, DialogMap } from "./types";

type OpenFn = <K extends DialogKind>(kind: K, ctx?: DialogMap[K]) => void;

const QuickActionsContext = createContext<OpenFn | null>(null);

/** Abre cualquier diálogo de acción rápida desde cualquier parte de la app. */
export function useQuickActions(): { open: OpenFn } {
  const open = useContext(QuickActionsContext);
  if (!open) throw new Error("QuickActionsProvider no está montado");
  return useMemo(() => ({ open }), [open]);
}

interface Active {
  kind: DialogKind;
  ctx: DialogMap[DialogKind];
  key: number;
}

export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);

  const open = useCallback<OpenFn>((kind, ctx) => {
    setActive({ kind, ctx: (ctx ?? {}) as DialogMap[DialogKind], key: Date.now() });
  }, []);
  const close = useCallback(() => setActive(null), []);

  const Dialog = active ? (DIALOG_REGISTRY[active.kind] as React.ComponentType<{ ctx: DialogMap[DialogKind]; onClose: () => void }>) : null;

  return (
    <QuickActionsContext.Provider value={open}>
      {children}
      {Dialog && active && <Dialog key={active.key} ctx={active.ctx} onClose={close} />}
    </QuickActionsContext.Provider>
  );
}
