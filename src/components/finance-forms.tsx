"use client";

import { applyChargeAction, copyRatesAction, saveBankAccountAction, setBroughtForwardAction, setRateAction } from "@/app/actions/finance";
import { LABELS, Frequency } from "@/domain/enums";
import { useState } from "react";
import { ActionForm, Checkbox, CheckboxList, Hidden, SelectField, SubmitButton, TextField, type Option } from "./forms";
import type { BankAccountRecord } from "@/server/ports/repositories";

const frequencyOptions = Object.values(Frequency).map((f) => ({ value: f, label: LABELS.frequency[f] }));

export function RateForm({ year, categories }: { year: number; categories: Option[] }) {
  return (
    <ActionForm action={setRateAction}>
      <Hidden name="year" value={String(year)} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField name="categoryId" label="Category" options={categories} placeholder="Choose…" />
        <SelectField name="frequency" label="How often" options={frequencyOptions} defaultValue="MONTHLY" hint="One-time = levies/events applied on the Charges page." />
        <TextField name="amount" label="Amount (₦) per period" inputMode="decimal" required />
      </div>
      <TextField name="note" label="Note (optional)" placeholder="e.g. Approved at the January AGM" />
      <TextField name="reason" label="Reason (required when changing an existing rate)" />
      <SubmitButton>Save {year} rate</SubmitButton>
    </ActionForm>
  );
}

export function CopyRatesForm({ year }: { year: number }) {
  return (
    <ActionForm action={copyRatesAction}>
      <Hidden name="year" value={String(year)} />
      <SubmitButton variant="secondary" pendingText="Copying…">Copy rates from {year - 1}</SubmitButton>
    </ActionForm>
  );
}

export function BroughtForwardForm({ year, current }: { year: number; current: { amount: string; note: string } | null }) {
  return (
    <ActionForm action={setBroughtForwardAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="year" label="Financial year" type="number" defaultValue={String(year)} required />
        <TextField name="amount" label={`Balance brought forward (₦)`} inputMode="decimal" defaultValue={current?.amount} required />
      </div>
      <TextField name="note" label="Source / note" defaultValue={current?.note} placeholder="e.g. Closing balance per 2025 audited accounts" />
      <TextField name="reason" label="Reason (required when changing a recorded amount)" />
      <SubmitButton>Save brought forward</SubmitButton>
    </ActionForm>
  );
}

export function BankAccountForm({ account }: { account?: BankAccountRecord }) {
  return (
    <ActionForm action={saveBankAccountAction} resetOnSuccess={!account}>
      {account ? <Hidden name="accountId" value={account.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="bankName" label="Bank" defaultValue={account?.bankName} required />
        <TextField name="accountNumber" label="Account number" inputMode="numeric" maxLength={10} defaultValue={account?.accountNumber} required />
        <TextField name="accountName" label="Account name" defaultValue={account?.accountName} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="usage"
          label="Used for"
          defaultValue={account?.usage ?? "GENERAL"}
          options={[
            { value: "GENERAL", label: "General payments (shown to members)" },
            { value: "LINK_ONLY", label: "Payment links only" },
          ]}
        />
        <TextField name="sortOrder" label="Display order" type="number" defaultValue={String(account?.sortOrder ?? 0)} />
        <div className="flex items-end pb-2">
          <Checkbox name="isActive" label="Active" defaultChecked={account?.isActive ?? true} />
        </div>
      </div>
      <SubmitButton>{account ? "Save" : "Add account"}</SubmitButton>
    </ActionForm>
  );
}

export function ChargeForm({ year, categories, members }: { year: number; categories: Option[]; members: Option[] }) {
  return (
    <ActionForm action={applyChargeAction}>
      <Hidden name="year" value={String(year)} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField name="categoryId" label="Levy / event category" options={categories} placeholder="Choose…" />
        <TextField name="name" label="Event or levy name (optional)" placeholder="e.g. Harvest dinner" hint="Leave blank for a once-a-year levy." />
        <TextField name="amount" label="Amount (₦, optional)" inputMode="decimal" hint={`Defaults to the ${year} rate.`} />
      </div>
      <ChargeMembersField members={members} />
      <SubmitButton>Apply charge</SubmitButton>
    </ActionForm>
  );
}

/** Who a charge applies to: everyone active, or members ticked from a searchable list. */
function ChargeMembersField({ members }: { members: Option[] }) {
  const [allMembers, setAllMembers] = useState(true);
  const choice = (all: boolean, label: string) => (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/5">
      <input type="radio" name="appliesTo" checked={allMembers === all} onChange={() => setAllMembers(all)} className="h-5 w-5 accent-[var(--brand)]" />
      {label}
    </label>
  );
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1.5 block text-sm font-medium">Apply to</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {choice(true, "All active members")}
        {choice(false, "Only selected members")}
      </div>
      {allMembers ? <input type="hidden" name="allMembers" value="on" /> : <CheckboxList name="memberIds" label="Members" options={members} searchPlaceholder="Search by name" />}
    </fieldset>
  );
}
