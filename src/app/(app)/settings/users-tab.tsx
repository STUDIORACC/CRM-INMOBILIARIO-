"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KeyRound, MoreHorizontal, Pencil, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createUserAction, resetUserPasswordAction, updateUserAction } from "@/actions/users";
import { Form, FormError, PasswordField, SelectField, SubmitButton, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useCatalogs, useSession } from "@/components/providers/app-context";
import { AppDialog } from "@/components/shared/app-dialog";
import { OptBadge } from "@/components/shared/badges";
import { Panel } from "@/components/shared/panel";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLES } from "@/lib/domain/constants";
import { fmtDate } from "@/lib/domain/dates";
import { PERMISSION_MATRIX } from "@/lib/domain/permissions";
import type { TeamUser } from "@/lib/types/catalogs";
import { cn } from "@/lib/utils";
import { resetPasswordSchema, userCreateSchema, userUpdateSchema } from "@/lib/validation/settings";

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r.value, label: r.label }));
const ROLE_HINT: Record<string, string> = {
  admin: "Acceso total, incluida la configuración y la gestión de usuarios.",
  manager: "Ve y gestiona todo el equipo, reportes y auditoría. No cambia la configuración.",
  advisor: "Trabaja sus propios leads, oportunidades, visitas y tareas.",
  assistant: "Registra y asigna leads, agenda visitas. Sin acceso a oportunidades ni propietarios.",
};

export function UsersTab() {
  const { users } = useCatalogs();
  const session = useSession();
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "edit"; user: TeamUser } | { kind: "password"; user: TeamUser } | null>(null);
  const active = users.filter((u) => u.status === "active").length;

  return (
    <div className="space-y-4">
      <Panel
        title="Usuarios"
        description={`${active} activos de ${users.length}. Cada persona entra con su correo y contraseña; el rol define lo que puede ver y hacer.`}
        action={
          <Button size="sm" onClick={() => setDialog({ kind: "create" })}>
            <UserPlus /> Nuevo usuario
          </Button>
        }
        bodyClassName="px-0"
      >
        <ul className="divide-y border-t">
          {users.map((u) => (
            <li key={u.id} className={cn("flex items-center gap-3 px-5 py-3", u.status === "inactive" && "bg-muted/40")}>
              <UserAvatar name={u.fullName} src={u.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("truncate text-sm font-medium", u.status === "inactive" && "text-muted-foreground")}>{u.fullName}</span>
                  {u.id === session.id && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Tú</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.email} · desde {fmtDate(u.hiredAt)}
                </div>
              </div>
              <OptBadge list={ROLES} value={u.role} className="hidden sm:inline-flex" />
              <span className={cn("hidden rounded-full px-2 py-0.5 text-xs font-medium md:inline", u.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{u.status === "active" ? "Activo" : "Inactivo"}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${u.fullName}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", user: u })}>
                    <Pencil /> Editar usuario
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "password", user: u })}>
                    <KeyRound /> Restablecer contraseña
                  </DropdownMenuItem>
                  {u.role !== "assistant" && (
                    <DropdownMenuItem asChild>
                      <Link href={`/team/${u.id}`}>Ver tablero de trabajo</Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </Panel>

      <PermissionMatrix />

      {dialog?.kind === "create" && <CreateUserDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <EditUserDialog user={dialog.user} onClose={() => setDialog(null)} />}
      {dialog?.kind === "password" && <PasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const { form, submit, formError, submitting } = useActionForm({
    schema: userCreateSchema,
    defaultValues: { fullName: "", email: "", phone: "", role: "advisor" as const, password: "" },
    action: createUserAction,
    onSuccess: onClose,
  });
  const role = form.watch("role") as string;
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo usuario"
      description="Crea la cuenta y comparte la contraseña temporal por un canal seguro. Podrá cambiarla desde Configuración > Mi perfil."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="user-create-form" loading={submitting} loadingText="Creando…">
            Crear usuario
          </SubmitButton>
        </>
      }
    >
      <Form id="user-create-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="fullName" label="Nombre completo" required autoFocus autoComplete="off" className="sm:col-span-2" />
          <TextField name="email" label="Correo (usuario de acceso)" type="email" required autoComplete="off" />
          <TextField name="phone" label="Teléfono / WhatsApp" inputMode="tel" />
          <SelectField name="role" label="Rol" required options={ROLE_OPTIONS} hint={ROLE_HINT[role]} className="sm:col-span-2" />
          <PasswordField name="password" label="Contraseña temporal" required hint="Mínimo 8 caracteres, con letras y números." className="sm:col-span-2" />
        </div>
      </Form>
    </AppDialog>
  );
}

function EditUserDialog({ user, onClose }: { user: TeamUser; onClose: () => void }) {
  const { users } = useCatalogs();
  const session = useSession();
  const self = user.id === session.id;
  const { form, submit, formError, submitting } = useActionForm({
    schema: userUpdateSchema,
    defaultValues: { id: user.id, fullName: user.fullName, phone: user.phone ?? "", role: user.role, status: user.status, reassignTo: "" },
    action: updateUserAction,
    onSuccess: (data) => {
      const r = (data as { reassigned: Record<string, number> | null } | undefined)?.reassigned;
      if (r) {
        const total = Object.values(r).reduce((a, b) => a + b, 0);
        if (total) toast.info(`Se traspasaron ${r.leads} leads, ${r.opportunities} oportunidades, ${r.tasks} tareas, ${r.visits} visitas y ${r.properties} propiedades.`);
      }
      onClose();
    },
  });
  const status = form.watch("status") as string;
  const role = form.watch("role") as string;
  const targets = useMemo(() => users.filter((u) => u.status === "active" && u.id !== user.id && u.role !== "assistant"), [users, user.id]);
  const deactivating = user.status === "active" && status === "inactive";

  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Editar a ${user.fullName}`}
      description={user.email}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="user-edit-form" loading={submitting}>
            Guardar cambios
          </SubmitButton>
        </>
      }
    >
      <Form id="user-edit-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="fullName" label="Nombre completo" required className="sm:col-span-2" />
          <TextField name="phone" label="Teléfono / WhatsApp" inputMode="tel" className="sm:col-span-2" />
          <SelectField name="role" label="Rol" required options={ROLE_OPTIONS} disabled={self} hint={self ? "No puedes cambiar tu propio rol." : ROLE_HINT[role]} />
          <SelectField
            name="status"
            label="Estado"
            required
            options={[
              { value: "active", label: "Activo" },
              { value: "inactive", label: "Inactivo (sin acceso)" },
            ]}
            disabled={self}
          />
        </div>
        {deactivating && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-900">Al desactivar a {user.fullName.split(" ")[0]} perderá el acceso. Traspasa su trabajo abierto (leads, oportunidades, tareas, visitas y propiedades activas) a otra persona para que nada quede sin responsable.</p>
            <SelectField name="reassignTo" label="Traspasar trabajo abierto a" allowEmpty emptyLabel="No traspasar (queda con su nombre)" options={targets.map((t) => ({ value: t.id, label: t.fullName }))} />
          </div>
        )}
      </Form>
    </AppDialog>
  );
}

function PasswordDialog({ user, onClose }: { user: TeamUser; onClose: () => void }) {
  const { form, submit, formError, submitting } = useActionForm({
    schema: resetPasswordSchema,
    defaultValues: { id: user.id, password: "" },
    action: resetUserPasswordAction,
    onSuccess: onClose,
  });
  return (
    <AppDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Restablecer contraseña"
      description={`Define una contraseña temporal para ${user.fullName}. Compártela por un canal seguro.`}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <SubmitButton form="user-pass-form" loading={submitting}>
            Restablecer
          </SubmitButton>
        </>
      }
    >
      <Form id="user-pass-form" form={form} onSubmit={submit} className="space-y-4">
        <FormError message={formError} />
        <PasswordField name="password" label="Nueva contraseña" required hint="Mínimo 8 caracteres, con letras y números." />
      </Form>
    </AppDialog>
  );
}

function PermissionMatrix() {
  return (
    <Panel title="Permisos por rol" description="Qué puede hacer cada rol. La base de datos lo hace cumplir con seguridad a nivel de fila (RLS), no solo la interfaz." bodyClassName="px-0">
      <div className="overflow-x-auto border-t">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> Módulo
                </span>
              </th>
              {ROLES.map((r) => (
                <th key={r.value} className="px-3 py-2.5 font-medium">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {PERMISSION_MATRIX.map((row) => (
              <tr key={row.area}>
                <td className="px-5 py-2 font-medium">{row.area}</td>
                {(["admin", "manager", "advisor", "assistant"] as const).map((r) => (
                  <td key={r} className={cn("px-3 py-2 text-xs", /^(Sin acceso|No)$/.test(row[r]) ? "text-muted-foreground" : "text-foreground")}>
                    {row[r]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
