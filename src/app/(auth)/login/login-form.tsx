"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/shared/user-avatar";
import { loginSchema } from "@/lib/validation/auth";
import { loginAction } from "./actions";

interface DemoAccount {
  role: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

const DEMO_PASSWORD = "Demo2026!";

export function LoginForm({ next, demoAccounts }: { next?: string; demoAccounts: DemoAccount[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [pending, startTransition] = useTransition();
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

  const submit = (values: { email: string; password: string }) => {
    const parsed = loginSchema.safeParse({ ...values, next });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({ email: f.email?.[0], password: f.password?.[0] });
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await loginAction(parsed.data);
      if (res.ok) {
        toast.success("¡Bienvenido!");
        router.replace(res.data.redirectTo);
        router.refresh();
      } else {
        setLoadingEmail(null);
        setErrors({ form: res.error });
      }
    });
  };

  return (
    <div className="mt-7 space-y-6">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit({ email, password });
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-[13px] font-medium">
            Correo electrónico
          </label>
          <Input id="email" type="email" autoComplete="username" placeholder="tu.nombre@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} className="h-10" />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-[13px] font-medium">
            Contraseña
          </label>
          <div className="relative">
            <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} className="h-10 pr-10" />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>
        {errors.form && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.form}
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && !loadingEmail && <Loader2 className="animate-spin" />}
          Ingresar
        </Button>
      </form>

      {demoAccounts.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            Acceso demo rápido
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2">
            {demoAccounts.map((a) => (
              <button
                key={a.email}
                type="button"
                disabled={pending}
                onClick={() => {
                  setLoadingEmail(a.email);
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  submit({ email: a.email, password: DEMO_PASSWORD });
                }}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:opacity-60"
              >
                <UserAvatar name={a.name} src={a.avatarUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  <span className="block text-xs text-muted-foreground">{a.role}</span>
                </span>
                {loadingEmail === a.email ? <Loader2 className="size-4 animate-spin text-primary" /> : <span className="text-xs font-medium text-primary">Entrar</span>}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Contraseña de todas las cuentas demo: <code className="rounded bg-muted px-1 py-0.5 font-mono">{DEMO_PASSWORD}</code>
          </p>
        </div>
      )}
    </div>
  );
}
