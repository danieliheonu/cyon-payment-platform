"use client";

import { useState } from "react";
import { confirmPaymentAction, correctPaymentAction, rejectPaymentAction } from "@/app/actions/finance";
import { ActionForm, Hidden, SelectField, SubmitButton, TextField, type Option } from "./forms";
import { Button } from "./ui";

/** Confirm a pending payment; for guest payers an officer may link a suggested member. */
export function ConfirmForm({ paymentId, memberSuggestions }: { paymentId: string; memberSuggestions: Option[] }) {
  return (
    <ActionForm action={confirmPaymentAction}>
      <Hidden name="paymentId" value={paymentId} />
      {memberSuggestions.length ? (
        <SelectField
          name="linkMemberId"
          label="Matching member found"
          options={memberSuggestions}
          defaultValue={memberSuggestions[0].value}
          placeholder="Don't link to a member"
          hint="The payer's phone or email matches this member. Linking adds the payment to their record."
        />
      ) : null}
      <SubmitButton pendingText="Confirming…">Confirm money received</SubmitButton>
    </ActionForm>
  );
}

export function RejectForm({ paymentId }: { paymentId: string }) {
  return (
    <ActionForm action={rejectPaymentAction}>
      <Hidden name="paymentId" value={paymentId} />
      <TextField name="reason" label="Reason for rejecting" placeholder="e.g. No matching credit on the bank statement" required />
      <SubmitButton variant="danger" pendingText="Rejecting…">
        Reject payment
      </SubmitButton>
    </ActionForm>
  );
}

/** Corrections keep the original: it is voided and (optionally) replaced. */
export function CorrectionForm({ paymentId, categories, current }: { paymentId: string; categories: Option[]; current: { amount: string; paidOn: string; categoryId: string } }) {
  const [mode, setMode] = useState<"replace" | "void">("replace");
  return (
    <ActionForm action={correctPaymentAction}>
      <Hidden name="paymentId" value={paymentId} />
      <Hidden name="mode" value={mode} />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "replace" ? "primary" : "secondary"} onClick={() => setMode("replace")}>
          Correct details
        </Button>
        <Button type="button" size="sm" variant={mode === "void" ? "danger" : "secondary"} onClick={() => setMode("void")}>
          Void payment
        </Button>
      </div>
      {mode === "replace" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="amount" label="Correct amount (₦)" defaultValue={current.amount} inputMode="decimal" />
          <TextField name="paidOn" label="Correct payment date" type="date" defaultValue={current.paidOn} />
          <SelectField name="categoryId" label="Correct category" options={categories} defaultValue={current.categoryId} />
        </div>
      ) : (
        <p className="text-sm text-muted">The payment will be voided and stop counting toward totals and balances. It stays on record.</p>
      )}
      <TextField name="reason" label="Reason (kept in the audit log)" required />
      <SubmitButton variant={mode === "void" ? "danger" : "primary"}>{mode === "void" ? "Void payment" : "Save correction"}</SubmitButton>
    </ActionForm>
  );
}
