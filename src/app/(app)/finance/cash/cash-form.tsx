"use client";

import { recordCashAction } from "@/app/actions/finance";
import { ActionForm, IdempotencyKey, SelectField, SubmitButton, TextField, type Option } from "@/components/forms";

export function CashForm({ members, categories, today }: { members: Option[]; categories: Option[]; today: string }) {
  return (
    <ActionForm action={recordCashAction}>
      <IdempotencyKey />
      <SelectField name="memberId" label="Member" options={members} placeholder="Not a member (enter name below)" />
      <TextField name="payerName" label="Payer's name (non-members only)" />
      <SelectField name="categoryId" label="Payment category" options={categories} placeholder="Choose…" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="amount" label="Amount (₦)" inputMode="decimal" required />
        <TextField name="paidOn" label="Date received" type="date" max={today} defaultValue={today} required />
      </div>
      <TextField name="note" label="Note (optional)" placeholder="e.g. Collected after Sunday mass" />
      <SubmitButton pendingText="Recording…">Record cash and issue receipt</SubmitButton>
    </ActionForm>
  );
}
