"use client";

import { use } from "react";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, Hidden, PasswordField, SubmitButton, TextField } from "@/components/forms";

export function LoginForm({ next }: { next: Promise<string> }) {
  return (
    <ActionForm action={loginAction}>
      <Hidden name="next" value={use(next)} />
      <TextField name="identifier" label="Email or phone number" autoComplete="username" required autoFocus />
      <PasswordField name="password" label="Password" autoComplete="current-password" required />
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-center text-xs text-muted">Forgot your password? Ask the CYON administrator to reset it.</p>
    </ActionForm>
  );
}
