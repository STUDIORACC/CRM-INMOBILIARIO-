"use client";

import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Controller, FormProvider, useFormContext, type FieldValues, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

// --- Contenedor ------------------------------------------------------------------
export function Form<V extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
  id,
}: {
  form: UseFormReturn<V>;
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <FormProvider {...(form as unknown as UseFormReturn<FieldValues>)}>
      <form id={id} onSubmit={onSubmit} noValidate className={className}>
        {children}
      </form>
    </FormProvider>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}

export function SubmitButton({ loading, children, loadingText = "Guardando…", className, variant, disabled, form }: { loading: boolean; children: React.ReactNode; loadingText?: string; className?: string; variant?: "default" | "destructive" | "outline"; disabled?: boolean; form?: string }) {
  return (
    <Button type="submit" form={form} disabled={loading || disabled} className={className} variant={variant}>
      {loading && <Loader2 className="animate-spin" />}
      {loading ? loadingText : children}
    </Button>
  );
}

// --- Envoltorio de campo ------------------------------------------------------------
function useFieldError(name: string): string | undefined {
  const {
    formState: { errors },
  } = useFormContext();
  const parts = name.split(".");
  let cur: unknown = errors;
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return (cur as { message?: string } | undefined)?.message;
}

export function FieldShell({
  name,
  label,
  required,
  hint,
  children,
  className,
}: {
  name: string;
  label?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const error = useFieldError(name);
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={`f-${name}`} className="text-[13px] font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// --- Texto -------------------------------------------------------------------------------
export function TextField({
  name,
  label,
  type = "text",
  placeholder,
  required,
  hint,
  className,
  inputMode,
  autoComplete,
  maxLength,
  disabled,
  autoFocus,
  min,
  max,
  step,
}: {
  name: string;
  label?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}) {
  const { register } = useFormContext();
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} className={className}>
      <Input
        id={`f-${name}`}
        type={type}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        disabled={disabled}
        autoFocus={autoFocus}
        min={min}
        max={max}
        step={step}
        aria-invalid={Boolean(error)}
        {...register(name)}
      />
    </FieldShell>
  );
}

export function TextareaField({ name, label, placeholder, required, hint, rows = 3, className, maxLength }: { name: string; label?: string; placeholder?: string; required?: boolean; hint?: string; rows?: number; className?: string; maxLength?: number }) {
  const { register } = useFormContext();
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} className={className}>
      <Textarea id={`f-${name}`} rows={rows} placeholder={placeholder} maxLength={maxLength} aria-invalid={Boolean(error)} {...register(name)} />
    </FieldShell>
  );
}

// --- Número -------------------------------------------------------------------------------
export function NumberField({
  name,
  label,
  placeholder,
  required,
  hint,
  prefix,
  suffix,
  className,
  allowDecimals = true,
  disabled,
}: {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  prefix?: string;
  suffix?: string;
  className?: string;
  allowDecimals?: boolean;
  disabled?: boolean;
}) {
  const { control } = useFormContext();
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => <NumberInput id={`f-${name}`} value={field.value as number | null | undefined} onChange={field.onChange} onBlur={field.onBlur} prefix={prefix} suffix={suffix} placeholder={placeholder} invalid={Boolean(error)} allowDecimals={allowDecimals} disabled={disabled} />}
      />
    </FieldShell>
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  onBlur,
  prefix,
  suffix,
  placeholder,
  invalid,
  allowDecimals = true,
  disabled,
  className,
}: {
  id?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  onBlur?: () => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  invalid?: boolean;
  allowDecimals?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  // Sincroniza cuando el valor cambia desde fuera (reset, valores por defecto) sin pisar lo que el usuario escribe
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    if (!(Number(text.replace(/,/g, "")) === value || (value == null && text === ""))) setText(value == null ? "" : String(value));
  }
  return (
    <div className={cn("relative", className)}>
      {prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
      <Input
        id={id}
        inputMode={allowDecimals ? "decimal" : "numeric"}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={cn(prefix && "pl-9", suffix && "pr-10")}
        onBlur={onBlur}
        onChange={(e) => {
          const raw = e.target.value.replace(/,/g, "");
          const re = allowDecimals ? /^\d*\.?\d*$/ : /^\d*$/;
          if (!re.test(raw)) return;
          setText(raw);
          if (raw === "" || raw === ".") onChange(null);
          else onChange(Number(raw));
        }}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// --- Selección ---------------------------------------------------------------------------------
const NONE = "__none__";

export function SelectField({
  name,
  label,
  options,
  placeholder = "Seleccionar…",
  required,
  hint,
  allowEmpty = false,
  emptyLabel = "Sin especificar",
  className,
  disabled,
  onValueChange,
}: {
  name: string;
  label?: string;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  hint?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
  onValueChange?: (v: string) => void;
}) {
  const { control } = useFormContext();
  const error = useFieldError(name);
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value ? String(field.value) : allowEmpty ? NONE : ""}
            onValueChange={(v) => {
              const next = v === NONE ? "" : v;
              field.onChange(next);
              onValueChange?.(next);
            }}
            disabled={disabled}
          >
            <SelectTrigger id={`f-${name}`} className="w-full" aria-invalid={Boolean(error)} onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowEmpty && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </FieldShell>
  );
}

/** Selección múltiple en popover con casillas (distritos, tipos…). */
export function MultiSelectField({ name, label, options, placeholder = "Seleccionar…", hint, className, required }: { name: string; label?: string; options: Option[]; placeholder?: string; hint?: string; className?: string; required?: boolean }) {
  const { control } = useFormContext();
  return (
    <FieldShell name={name} label={label} hint={hint} className={className} required={required}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const value: string[] = Array.isArray(field.value) ? field.value : [];
          const toggle = (v: string) => field.onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" id={`f-${name}`} className="h-auto min-h-9 w-full justify-between bg-white py-1.5 font-normal">
                  <span className="flex flex-wrap gap-1">
                    {value.length === 0 ? (
                      <span className="text-muted-foreground">{placeholder}</span>
                    ) : (
                      value.map((v) => (
                        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          {options.find((o) => o.value === v)?.label ?? v}
                        </span>
                      ))
                    )}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-72 w-[--radix-popover-trigger-width] min-w-56 overflow-y-auto p-1.5">
                {options.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                    {o.label}
                  </label>
                ))}
                {value.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="mt-1 w-full" onClick={() => field.onChange([])}>
                    Limpiar selección
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          );
        }}
      />
    </FieldShell>
  );
}

/** Chips alternables (características, etiquetas). */
export function ChipsField({ name, label, options, hint, className }: { name: string; label?: string; options: Array<Option & { color?: string }>; hint?: string; className?: string }) {
  const { control } = useFormContext();
  return (
    <FieldShell name={name} label={label} hint={hint} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const value: string[] = Array.isArray(field.value) ? field.value : [];
          return (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
              {options.map((o) => {
                const on = value.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => field.onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      on ? "border-primary bg-primary/10 text-primary" : "border-input bg-white text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {on && <Check className="size-3" />}
                    {o.label}
                  </button>
                );
              })}
            </div>
          );
        }}
      />
    </FieldShell>
  );
}

export function SwitchField({ name, label, hint, className }: { name: string; label: string; hint?: string; className?: string }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className={cn("flex items-start justify-between gap-4 rounded-lg border bg-white px-3 py-2.5", className)}>
          <div>
            <label htmlFor={`f-${name}`} className="text-sm font-medium">
              {label}
            </label>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <Switch id={`f-${name}`} checked={Boolean(field.value)} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  );
}

export function CheckboxField({ name, label, className }: { name: string; label: string; className?: string }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className={cn("flex cursor-pointer items-center gap-2.5 text-sm", className)}>
          <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
          {label}
        </label>
      )}
    />
  );
}

export function ClearButton({ onClick, label = "Quitar" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label={label}>
      <X className="size-3.5" />
    </button>
  );
}

// --- Color y contraseña ------------------------------------------------------------------
const SWATCHES = ["#6366f1", "#3b82f6", "#0ea5e9", "#14b8a6", "#10b981", "#84cc16", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#64748b"];

/** Selector de color con paleta rápida (etiquetas, etapas, fuentes). */
export function ColorField({ name, label, className }: { name: string; label?: string; className?: string }) {
  const { control } = useFormContext();
  return (
    <FieldShell name={name} label={label} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label ?? "Color"}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={field.value?.toLowerCase() === c}
                onClick={() => field.onChange(c)}
                className={cn("flex size-6 items-center justify-center rounded-full ring-offset-2 transition-transform hover:scale-110", field.value?.toLowerCase() === c && "ring-2 ring-primary")}
                style={{ backgroundColor: c }}
              >
                {field.value?.toLowerCase() === c && <Check className="size-3.5 text-white" strokeWidth={3} />}
              </button>
            ))}
            <input type="color" aria-label="Color personalizado" value={/^#[0-9a-f]{6}$/i.test(field.value ?? "") ? field.value : "#6366f1"} onChange={(e) => field.onChange(e.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
          </div>
        )}
      />
    </FieldShell>
  );
}

/** Contraseña con botón para mostrar u ocultar. */
export function PasswordField({ name, label, required, hint, className, autoComplete = "new-password" }: { name: string; label?: string; required?: boolean; hint?: string; className?: string; autoComplete?: string }) {
  const { register } = useFormContext();
  const error = useFieldError(name);
  const [show, setShow] = useState(false);
  return (
    <FieldShell name={name} label={label} required={required} hint={hint} className={className}>
      <div className="relative">
        <Input id={`f-${name}`} type={show ? "text" : "password"} autoComplete={autoComplete} aria-invalid={Boolean(error)} className="pr-16" {...register(name)} />
        <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs font-medium text-muted-foreground hover:bg-muted" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </FieldShell>
  );
}
