"use client";

import { useState } from "react";
import { createPaymentLinkAction, setLinkStatusAction } from "@/app/actions/finance";
import { ActionForm, Checkbox, Hidden, SelectField, SubmitButton, TextArea, TextField, type Option } from "@/components/forms";
import { AmountMode, LABELS } from "@/domain/enums";
import { Card } from "@/components/ui";

export function PaymentLinkForm({ categories, accounts }: { categories: Option[]; accounts: Option[] }) {
  const [mode, setMode] = useState<AmountMode>("OPEN");
  const [account, setAccount] = useState(accounts[0]?.value ?? "");
  return (
    <ActionForm action={createPaymentLinkAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="title" label="Title" placeholder="e.g. Harvest Thanksgiving 2026" required />
        <SelectField name="categoryId" label="Record under category" options={categories} placeholder="Choose…" />
      </div>
      <TextArea name="purpose" label="Purpose (shown to payers and printed on receipts)" required />

      <SelectField
        name="bankAccountId"
        label="Receiving account"
        options={accounts}
        placeholder="+ Add a new account for this link"
        value={account}
        onChange={(e) => setAccount(e.target.value)}
      />
      {!account ? (
        <Card className="bg-surface-muted">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="newBankName" label="Bank" />
            <TextField name="newAccountNumber" label="Account number" inputMode="numeric" maxLength={10} />
            <TextField name="newAccountName" label="Account name" />
          </div>
          <p className="mt-2 text-xs text-muted">Saved as a “payment links only” account — it won&apos;t appear on the members&apos; payment page.</p>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="amountMode"
          label="Amount"
          value={mode}
          onChange={(e) => setMode(e.target.value as AmountMode)}
          options={Object.values(AmountMode).map((m) => ({ value: m, label: LABELS.amountMode[m] }))}
        />
        {mode !== "OPEN" ? <TextField name="amount" label={mode === "FIXED" ? "Amount (₦)" : "Minimum (₦)"} inputMode="decimal" /> : null}
        <TextField name="target" label="Target (₦, optional)" inputMode="decimal" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="closesOn" label="Closing date (optional)" type="date" />
        <div className="flex items-end pb-2">
          <Checkbox name="autoCloseOnTarget" label="Close automatically when the target is reached" />
        </div>
      </div>
      <SubmitButton>Create link</SubmitButton>
    </ActionForm>
  );
}

export function LinkStatusForm({ linkId, open }: { linkId: string; open: boolean }) {
  return (
    <ActionForm action={setLinkStatusAction}>
      <Hidden name="linkId" value={linkId} />
      <Hidden name="status" value={open ? "CLOSED" : "OPEN"} />
      <SubmitButton variant={open ? "danger" : "primary"}>{open ? "Close link" : "Reopen link"}</SubmitButton>
    </ActionForm>
  );
}
