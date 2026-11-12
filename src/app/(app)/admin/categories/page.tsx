import type { Metadata } from "next";
import { LABELS } from "@/domain/enums";
import { Permission } from "@/domain/permissions";
import { formatDateOnly, toLagosDateOnly } from "@/lib/dates";
import { Badge, Card, PageHeader } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";
import { CategoryForm } from "./category-form";

export const metadata: Metadata = { title: "Payment categories" };

export default async function CategoriesPage() {
  await requirePermission(Permission.MANAGE_CATEGORIES);
  const categories = await services().categories.list();
  const today = toLagosDateOnly();

  return (
    <>
      <PageHeader
        title="Payment categories"
        description="How payments are grouped: dues, levies, events and donations. Amounts and frequency for fixed categories are set per year on Dues & levy rates by the Financial Officer."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          {categories.length ? null : <p className="text-sm text-muted">No categories yet.</p>}
          {categories.map((c) => (
            <details key={c.id} className="rounded-lg border border-border bg-surface">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                <span className="font-medium">{c.name}</span>
                <Badge>{LABELS.categoryGroup[c.group]}</Badge>
                <Badge>{c.pricing === "FIXED" ? "Fixed" : "Open amount"}</Badge>
                {c.isActive ? null : <Badge className="bg-warning-soft text-warning">Inactive</Badge>}
                <span className="ml-auto text-xs text-muted">from {formatDateOnly(c.startsOn)}</span>
              </summary>
              <div className="border-t border-border p-4">
                <CategoryForm category={c} today={today} />
              </div>
            </details>
          ))}
        </div>
        <Card title="Add a category">
          <CategoryForm today={today} />
        </Card>
      </div>
    </>
  );
}
