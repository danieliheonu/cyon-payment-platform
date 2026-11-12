import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/ui";
import { currentSession, requireActor } from "@/server/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return (
    <Suspense>
      <ChangePassword />
    </Suspense>
  );
}

async function ChangePassword() {
  const actor = await requireActor({ allowPasswordChange: true });
  // No way back while a temporary or default password must be replaced.
  const forced = (await currentSession())?.user.mustChangePassword ?? true;
  return (
    <>
      {forced ? null : <BackLink href="/" label="Back" />}
      <h1 className="mb-1 text-lg font-semibold">Change password</h1>
      <p className="mb-5 text-sm text-muted">Hi {actor.displayName}. Choose a password only you know.</p>
      <ChangePasswordForm />
    </>
  );
}
