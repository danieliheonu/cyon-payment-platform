"use client";

import { changeRoleAction, createStaffUserAction, resetPasswordAction, setActiveAction } from "@/app/actions/admin";
import { ActionForm, Hidden, OneTimeValue, SelectField, SubmitButton, TextField, type Option } from "@/components/forms";

const PASSWORD_NOTE = "Share this privately. It must be changed at first sign-in and won't be shown again.";

export function StaffUserForm({ roles }: { roles: Option[] }) {
  return (
    <ActionForm
      action={createStaffUserAction}
      resetOnSuccess
      successContent={(s) => (s.data?.temporaryPassword ? <OneTimeValue label="Temporary password" value={s.data.temporaryPassword} note={PASSWORD_NOTE} /> : null)}
    >
      <TextField name="name" label="Name" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="email" label="Email" type="email" />
        <TextField name="phone" label="Phone" inputMode="tel" />
      </div>
      <SelectField name="role" label="Role" options={roles} />
      <SubmitButton>Create account</SubmitButton>
    </ActionForm>
  );
}

export function ChangeRoleForm({ userId, role, roles }: { userId: string; role: string; roles: Option[] }) {
  return (
    <ActionForm action={changeRoleAction}>
      <Hidden name="userId" value={userId} />
      <SelectField name="role" label="Role" options={roles} defaultValue={role} />
      <TextField name="reason" label="Reason" required />
      <SubmitButton variant="secondary">Change role</SubmitButton>
    </ActionForm>
  );
}

export function SetActiveForm({ userId, isActive }: { userId: string; isActive: boolean }) {
  return (
    <ActionForm action={setActiveAction}>
      <Hidden name="userId" value={userId} />
      <Hidden name="active" value={isActive ? "false" : "true"} />
      <TextField name="reason" label="Reason" required />
      <SubmitButton variant={isActive ? "danger" : "primary"}>{isActive ? "Deactivate account" : "Activate account"}</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  return (
    <ActionForm
      action={resetPasswordAction}
      successContent={(s) => (s.data?.temporaryPassword ? <OneTimeValue label="Temporary password" value={s.data.temporaryPassword} note={PASSWORD_NOTE} /> : null)}
    >
      <Hidden name="userId" value={userId} />
      <SubmitButton variant="secondary">Reset password</SubmitButton>
    </ActionForm>
  );
}
