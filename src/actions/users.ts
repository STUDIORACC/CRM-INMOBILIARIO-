"use server";

import { defineAction, defineAdminAction } from "@/lib/actions/safe";
import { changeOwnPassword, createUserAccount, resetUserPassword, updateOwnProfile, updateUserAccount } from "@/lib/services/users";
import { changePasswordSchema, profileSchema, resetPasswordSchema, userCreateSchema, userUpdateSchema } from "@/lib/validation/settings";

export const createUserAction = defineAdminAction({
  schema: userCreateSchema,
  capability: "settings.manage",
  successMessage: "Usuario creado. Ya puede iniciar sesión con su correo y contraseña.",
  handler: ({ db }, input) => createUserAccount(db, input),
});

export const updateUserAction = defineAdminAction({
  schema: userUpdateSchema,
  capability: "settings.manage",
  successMessage: "Usuario actualizado",
  handler: ({ db, session }, input) => updateUserAccount(db, session, input),
});

export const resetUserPasswordAction = defineAdminAction({
  schema: resetPasswordSchema,
  capability: "settings.manage",
  successMessage: "Contraseña restablecida",
  handler: ({ db }, input) => resetUserPassword(db, input.id, input.password),
});

export const updateProfileAction = defineAction({
  schema: profileSchema,
  successMessage: "Perfil actualizado",
  handler: ({ db, session }, input) => updateOwnProfile(db, session.id, input),
});

/** Cambia la contraseña propia: el handler solo toca la fila del usuario autenticado. */
export const changePasswordAction = defineAdminAction({
  schema: changePasswordSchema,
  successMessage: "Contraseña actualizada",
  handler: ({ db, session }, input) => changeOwnPassword(db, session, input),
});
