"use client";

import { changePasswordAction, updateProfileAction } from "@/actions/users";
import { Form, FormError, PasswordField, SubmitButton, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { useSession } from "@/components/providers/app-context";
import { OptBadge } from "@/components/shared/badges";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shared/panel";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ROLES } from "@/lib/domain/constants";
import { changePasswordSchema, profileSchema } from "@/lib/validation/settings";

export function ProfileTab({ phone }: { phone: string | null }) {
  const session = useSession();
  const profile = useActionForm({
    schema: profileSchema,
    defaultValues: { fullName: session.fullName, phone: phone ?? "" },
    action: updateProfileAction,
    successMessage: "Perfil actualizado",
  });
  const password = useActionForm({
    schema: changePasswordSchema,
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
    action: changePasswordAction,
    resetOnSuccess: true,
    successMessage: "Contraseña actualizada",
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Mi perfil" description="Así te ven tus compañeros en asignaciones, visitas y actividad.">
        <div className="mb-4 flex items-center gap-3">
          <UserAvatar name={session.fullName} src={session.avatarUrl} size="lg" />
          <div className="min-w-0">
            <div className="truncate font-medium">{session.fullName}</div>
            <div className="truncate text-sm text-muted-foreground">{session.email}</div>
            <div className="mt-1">
              <OptBadge list={ROLES} value={session.role} />
            </div>
          </div>
        </div>
        <Form form={profile.form} onSubmit={profile.submit} className="space-y-4">
          <FormError message={profile.formError} />
          <TextField name="fullName" label="Nombre completo" required autoComplete="name" />
          <TextField name="phone" label="Teléfono / WhatsApp" inputMode="tel" autoComplete="tel" hint="Se usa en las plantillas de mensajes y en tu ficha de vendedor." />
          <div className="space-y-1.5">
            <label htmlFor="f-email-ro" className="text-[13px] font-medium">Correo electrónico</label>
            <Input id="f-email-ro" value={session.email} readOnly disabled />
            <p className="text-xs text-muted-foreground">El correo es tu usuario de acceso. Pide a un administrador cambiarlo.</p>
          </div>
          <SubmitButton loading={profile.submitting}>Guardar perfil</SubmitButton>
        </Form>
      </Panel>

      <Panel title="Contraseña" description="Usa al menos 8 caracteres, con letras y números.">
        <Form form={password.form} onSubmit={password.submit} className="space-y-4">
          <FormError message={password.formError} />
          <PasswordField name="currentPassword" label="Contraseña actual" required autoComplete="current-password" />
          <PasswordField name="newPassword" label="Nueva contraseña" required />
          <PasswordField name="confirm" label="Confirmar nueva contraseña" required />
          <SubmitButton loading={password.submitting} loadingText="Actualizando…">
            Cambiar contraseña
          </SubmitButton>
        </Form>
      </Panel>
    </div>
  );
}
