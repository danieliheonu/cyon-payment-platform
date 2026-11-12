"use client";

import { grantAction, revokeAction } from "@/app/actions/admin";
import { ActionForm, Checkbox, Hidden, SelectField, SubmitButton, TextField, useFieldError, type Option } from "@/components/forms";
import { FinanceArea, LABELS } from "@/domain/enums";

function AreasField() {
  const error = useFieldError("areas");
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Finance areas</legend>
      {Object.values(FinanceArea).map((area) => (
        <Checkbox key={area} name="areas" value={area} label={LABELS.financeArea[area]} showError={false} />
      ))}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </fieldset>
  );
}

export function GrantForm({ users, minDate }: { users: Option[]; minDate: string }) {
  return (
    <ActionForm action={grantAction} resetOnSuccess>
      <SelectField name="userId" label="Admin" options={users} placeholder="Choose an admin…" />
      <AreasField />
      <TextField name="expiresOn" label="Expires on (optional)" type="date" min={minDate} hint="Leave empty to keep until revoked. Access ends at the end of the chosen day." />
      <TextField name="reason" label="Reason" placeholder="e.g. Covering for the Financial Officer in December" required />
      <SubmitButton>Grant access</SubmitButton>
    </ActionForm>
  );
}

export function RevokeForm({ grantId }: { grantId: string }) {
  return (
    <ActionForm action={revokeAction}>
      <Hidden name="grantId" value={grantId} />
      <TextField name="reason" label="Reason for revoking" required />
      <SubmitButton variant="danger" pendingText="Revoking…">Revoke</SubmitButton>
    </ActionForm>
  );
}
