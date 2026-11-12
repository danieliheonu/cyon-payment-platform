"use client";

import { createMemberAction, createMemberLoginAction, resetMemberLoginAction, updateMemberAction } from "@/app/actions/admin";
import { LoginDetailsShare } from "@/components/login-details";
import { ActionForm, Checkbox, Hidden, SelectField, SubmitButton, TextField } from "@/components/forms";
import type { MemberRecord } from "@/server/ports/repositories";

export function MemberForm({ today, orgName, signInUrl }: { today: string; orgName: string; signInUrl: string }) {
  return (
    <ActionForm
      action={createMemberAction}
      resetOnSuccess
      successContent={({ data }) =>
        data?.password ? (
          <LoginDetailsShare
            memberName={data.memberName}
            orgName={orgName}
            signInUrl={signInUrl}
            identifier={data.identifier}
            password={data.password}
            phone={data.phone || null}
          />
        ) : null
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextField name="fullName" label="Full name" required />
        <TextField name="phone" label="Phone number" inputMode="tel" required />
        <TextField name="email" label="Email (optional)" type="email" />
        <TextField name="joinedAt" label="Date joined" type="date" defaultValue={today} required />
      </div>
      <Checkbox name="createLogin" label="Create a login so the member can pay and see receipts online" hint="Starts with the default member password, which they must change at first sign-in." defaultChecked />
      <SubmitButton>Add member</SubmitButton>
    </ActionForm>
  );
}

export function EditMemberForm({ member }: { member: MemberRecord }) {
  return (
    <ActionForm action={updateMemberAction}>
      <Hidden name="memberId" value={member.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="fullName" label="Full name" defaultValue={member.fullName} required />
        <TextField name="phone" label="Phone number" defaultValue={member.phone} required />
        <TextField name="email" label="Email" defaultValue={member.email ?? ""} />
        <TextField name="joinedAt" label="Date joined" type="date" defaultValue={member.joinedAt} required />
        <SelectField name="status" label="Status" defaultValue={member.status} options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive (no new dues)" }]} />
      </div>
      <SubmitButton>Save changes</SubmitButton>
    </ActionForm>
  );
}

/** Creates the member's login, or puts it back on the default password. */
export function MemberLoginForm({ memberId, hasLogin }: { memberId: string; hasLogin: boolean }) {
  return (
    <ActionForm action={hasLogin ? resetMemberLoginAction : createMemberLoginAction}>
      <Hidden name="memberId" value={memberId} />
      <SubmitButton variant="secondary">{hasLogin ? "Reset to default password" : "Create login"}</SubmitButton>
    </ActionForm>
  );
}
