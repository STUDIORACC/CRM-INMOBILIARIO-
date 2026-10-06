"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type DefaultValues, type Path, type Resolver, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/lib/actions/safe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface UseActionFormOptions<S extends z.ZodType, O = any> {
  schema: S;
  defaultValues: z.input<S>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (values: z.input<S>) => Promise<ActionResult<any>>;
  onSuccess?: (data: O, values: z.input<S>) => void;
  successMessage?: string;
  resetOnSuccess?: boolean;
  /** Devuelve true si el fallo se manejó (se omite el toast/mensaje por defecto). */
  onFailure?: (res: Extract<ActionResult<O>, { ok: false }>) => boolean;
}

export interface ActionForm<V extends Record<string, unknown>> {
  form: UseFormReturn<V>;
  submit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  formError: string | null;
  submitting: boolean;
}

/**
 * React Hook Form + Zod conectado a una server action:
 * valida en el cliente, envía los valores crudos (el servidor vuelve a validar),
 * mapea errores por campo y gestiona loading / éxito / error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useActionForm<S extends z.ZodType, O = any>(opts: UseActionFormOptions<S, O>): ActionForm<z.input<S> & Record<string, unknown>> {
  type V = z.input<S> & Record<string, unknown>;
  const form = useForm<V>({
    resolver: zodResolver(opts.schema as never) as unknown as Resolver<V>,
    defaultValues: opts.defaultValues as DefaultValues<V>,
    mode: "onTouched",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = form.handleSubmit(async () => {
    setFormError(null);
    const values = form.getValues() as z.input<S>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res: ActionResult<any>;
    try {
      res = await opts.action(values);
    } catch {
      res = { ok: false, error: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo." };
    }
    if (res.ok) {
      toast.success(res.message ?? opts.successMessage ?? "Cambios guardados");
      if (opts.resetOnSuccess) form.reset(opts.defaultValues as DefaultValues<V>);
      opts.onSuccess?.(res.data, values);
    } else {
      if (opts.onFailure?.(res)) return;
      setFormError(res.error);
      if (res.fieldErrors) {
        for (const [key, msgs] of Object.entries(res.fieldErrors)) {
          if (key === "_") continue;
          form.setError(key as Path<V>, { type: "server", message: msgs[0] });
        }
      }
      toast.error(res.error);
    }
  });

  return { form, submit, formError, submitting: form.formState.isSubmitting };
}
