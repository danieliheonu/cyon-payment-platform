"use client";

import { useState } from "react";
import { submitMemberTransferAction } from "@/app/actions/pay";
import { ActionForm, IdempotencyKey, SelectField, SubmitButton } from "@/components/forms";
import { AmountDateFields, TransferFields } from "@/components/transfer-fields";
import { BankAccountCard } from "@/components/bank-account-card";
import { Card } from "@/components/ui";
import { formatNaira } from "@/domain/money";
import type { BankAccountRecord } from "@/server/ports/repositories";

export interface PayCategory {
  id: string;
  name: string;
  fixed: boolean;
  outstandingKobo: number;
  open: Array<{ id: string; label: string; outstandingKobo: number }>;
}

export function PayForm({ categories, accounts, today }: { categories: PayCategory[]; accounts: BankAccountRecord[]; today: string }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const category = categories.find((c) => c.id === categoryId);

  return (
    <ActionForm action={submitMemberTransferAction} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <IdempotencyKey />
      <Card title="1. What are you paying for?">
        <div className="space-y-4">
          <SelectField
            name="categoryId"
            label="Payment category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={categories.map((c) => ({
              value: c.id,
              label: c.fixed ? `${c.name} — ${formatNaira(c.outstandingKobo)} outstanding` : c.name,
            }))}
          />
          {category?.fixed && category.open.length > 1 ? (
            <SelectField
              key={category.id}
              name="targetObligationId"
              label="Apply to"
              placeholder="Oldest unpaid first (recommended)"
              options={category.open.map((o) => ({ value: o.id, label: `${o.label} — ${formatNaira(o.outstandingKobo)}` }))}
              hint="Part payments are allowed; the remaining balance stays on your record."
            />
          ) : null}
          <AmountDateFields today={today} />
        </div>
      </Card>

      <Card title="2. Pay into" className="lg:row-span-2">
        <fieldset className="space-y-3">
          <legend className="sr-only">Receiving account</legend>
          {accounts.map((account, i) => (
            <label key={account.id} className="block cursor-pointer">
              <input type="radio" name="bankAccountId" value={account.id} defaultChecked={i === 0} className="peer sr-only" />
              <BankAccountCard account={account} className="peer-checked:border-brand peer-checked:ring-2 peer-checked:ring-brand/20" />
            </label>
          ))}
        </fieldset>
      </Card>

      <Card title="3. Transfer details and proof">
        <div className="space-y-4">
          <TransferFields />
          <SubmitButton pendingText="Submitting…">Submit payment</SubmitButton>
        </div>
      </Card>
    </ActionForm>
  );
}
