"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTaskStatusAction } from "@/actions/tasks";
import { cn } from "@/lib/utils";

/** Casilla para completar una tarea en un clic (actualización optimista). */
export function TaskCheck({ id, done = false, className }: { id: string; done?: boolean; className?: string }) {
  const [checked, setChecked] = useState(done);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Marcar como pendiente" : "Marcar como completada"}
      disabled={pending}
      onClick={() => {
        const next = !checked;
        setChecked(next);
        start(async () => {
          const res = await setTaskStatusAction({ id, status: next ? "completed" : "pending" });
          if (!res.ok) {
            setChecked(!next);
            toast.error(res.error);
          } else toast.success(res.message ?? "Listo");
        });
      }}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
        checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-primary hover:text-primary/40",
        className,
      )}
    >
      {pending ? <Loader2 className="size-3 animate-spin text-current" /> : <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}
