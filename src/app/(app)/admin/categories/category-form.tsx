"use client";

import { saveCategoryAction } from "@/app/actions/admin";
import { ActionForm, Checkbox, Hidden, SelectField, SubmitButton, TextField } from "@/components/forms";
import { CategoryGroup, LABELS, Pricing } from "@/domain/enums";
import type { CategoryRecord } from "@/server/ports/repositories";

const GROUPS = Object.values(CategoryGroup).map((g) => ({ value: g, label: LABELS.categoryGroup[g] }));
const PRICING = [
  { value: Pricing.FIXED, label: "Fixed — set a yearly rate; members get balances" },
  { value: Pricing.OPEN, label: "Open — payer chooses the amount (donations)" },
];

/** One form for adding and editing a category. */
export function CategoryForm({ category, today }: { category?: CategoryRecord; today: string }) {
  return (
    <ActionForm action={saveCategoryAction} resetOnSuccess={!category}>
      {category ? <Hidden name="categoryId" value={category.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Name" defaultValue={category?.name} placeholder="e.g. Monthly dues" required />
        <SelectField name="group" label="Group" options={GROUPS} defaultValue={category?.group ?? CategoryGroup.DUES} />
        <SelectField name="pricing" label="Amount" options={PRICING} defaultValue={category?.pricing ?? Pricing.FIXED} />
        <TextField name="startsOn" label="Starts on" type="date" defaultValue={category?.startsOn ?? today} required />
      </div>
      <Checkbox name="isActive" label="Active (shown to members and used for new dues)" defaultChecked={category?.isActive ?? true} />
      <SubmitButton>{category ? "Save" : "Add category"}</SubmitButton>
    </ActionForm>
  );
}
