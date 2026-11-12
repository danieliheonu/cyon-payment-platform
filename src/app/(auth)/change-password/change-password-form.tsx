"use client";

import { changePasswordAction } from "@/app/actions/auth";
import { ActionForm, PasswordField, SubmitButton } from "@/components/forms";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction}>
      <PasswordField name="currentPassword" label="Current (or temporary) password" autoComplete="current-password" required />
      <PasswordField name="newPassword" label="New password" autoComplete="new-password" hint="At least 8 characters, with letters and a number." required />
      <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" required />
      <SubmitButton className="w-full">Save password</SubmitButton>
    </ActionForm>
  );
}
