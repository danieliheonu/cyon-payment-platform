"use server";

import { redirect } from "next/navigation";
import { changePasswordSchema, loginSchema } from "@/lib/validation/schemas";
import { services } from "@/server/container";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { handleAction, type ActionState } from "@/server/http/action";
import { clientIp } from "@/server/http/client-ip";
import { clearSessionCookie, homePathFor, requireActor, sessionToken, setSessionCookie } from "@/server/auth/session";

export async function loginAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const next = safeRedirectPath(formData.get("next"));
  let destination = "/";
  const result = await handleAction(loginSchema, formData, async (input) => {
    const { token, user } = await services().auth.login(input.identifier, input.password, await clientIp());
    await setSessionCookie(token);
    destination = user.mustChangePassword ? "/change-password" : (next ?? "/");
  });
  if (result?.ok) redirect(destination);
  return result;
}

export async function logoutAction(): Promise<void> {
  const token = await sessionToken();
  if (token) await services().auth.logout(token);
  await clearSessionCookie();
  redirect("/login");
}

export async function changePasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor({ allowPasswordChange: true });
  const result = await handleAction(changePasswordSchema, formData, async (input) => {
    // Every other session is signed out; this device continues with a fresh session.
    const { token } = await services().auth.changePassword(actor, input.currentPassword, input.newPassword);
    await setSessionCookie(token);
  });
  if (result?.ok) redirect(homePathFor(actor));
  return result;
}
