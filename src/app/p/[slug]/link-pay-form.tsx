"use client";

import { submitLinkTransferAction } from "@/app/actions/pay";
import { ActionForm, Hidden, IdempotencyKey, SubmitButton, TextField } from "@/components/forms";
import { AmountDateFields, TransferFields } from "@/components/transfer-fields";
import { koboToNairaString } from "@/domain/money";

export function LinkPayForm({ slug, today, fixedAmount, amountLabel }: { slug: string; today: string; fixedAmount: number | null; amountLabel: string }) {
  return (
    <ActionForm action={submitLinkTransferAction}>
      <IdempotencyKey />
      <Hidden name="slug" value={slug} />
      <TextField name="payerName" label="Your full name" autoComplete="name" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="payerPhone" label="Phone number" inputMode="tel" autoComplete="tel" />
        <TextField name="payerEmail" label="Email (optional if phone given)" type="email" autoComplete="email" />
      </div>
      <AmountDateFields today={today} amountLabel={amountLabel} amountDefault={fixedAmount !== null ? koboToNairaString(fixedAmount) : undefined} amountReadOnly={fixedAmount !== null} />
      <TransferFields />
      <SubmitButton pendingText="Submitting…" className="w-full">Submit payment</SubmitButton>
    </ActionForm>
  );
}
