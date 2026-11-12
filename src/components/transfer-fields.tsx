"use client";

import { TextField } from "./forms";
import { ProofInput } from "./proof-input";

/** Bank-transfer details + required proof — the same fields on the member and public-link forms. */
export function TransferFields() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="senderBank" label="Bank you paid from" required />
        <TextField name="senderName" label="Name on the sending account" required />
      </div>
      <ProofInput />
    </>
  );
}

/** Amount + payment date, shared by both transfer forms. */
export function AmountDateFields({ today, amountLabel = "Amount (₦)", amountDefault, amountReadOnly }: { today: string; amountLabel?: string; amountDefault?: string; amountReadOnly?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name="amount" label={amountLabel} inputMode="decimal" placeholder="e.g. 5000" defaultValue={amountDefault} readOnly={amountReadOnly} required />
      <TextField name="paidOn" label="Date you paid" type="date" max={today} defaultValue={today} required />
    </div>
  );
}
