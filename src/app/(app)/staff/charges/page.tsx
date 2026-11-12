import type { Metadata } from "next";
import { can } from "@/domain/actor";
import { Permission } from "@/domain/permissions";
import { periodLabel } from "@/domain/periods";
import { toLagosDateOnly, yearOf } from "@/lib/dates";
import { yearFromParams } from "@/lib/validation/query";
import { ChargeForm } from "@/components/finance-forms";
import { YearPicker } from "@/components/year-picker";
import { Badge, Card, DataTable, Money, PageHeader } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Charges" };

export default async function ChargesPage({ searchParams }: PageProps<"/staff/charges">) {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const thisYear = yearOf(toLagosDateOnly());
  const year = yearFromParams(await searchParams, thisYear);
  const canApply = can(actor, Permission.MANAGE_CHARGES);
  const [summary, categories, members] = await Promise.all([
    services().obligations.chargeSummary(year),
    canApply ? services().categories.list({ activeOnly: true, pricing: "FIXED" }) : Promise.resolve([]),
    canApply ? services().members.list(actor, { status: "ACTIVE" }, { page: 1, pageSize: 5000 }) : Promise.resolve({ rows: [] }),
  ]);

  return (
    <>
      <PageHeader
        title={`Charges — ${year}`}
        description="What members owe, grouped by category and period. Recurring dues are generated automatically from the yearly rates; levies and events are applied here."
        actions={<YearPicker year={year} to={thisYear + 1} />}
      />
      <div className="space-y-6">
        <DataTable
          rows={summary}
          rowKey={(c) => `${c.categoryId}|${c.periodKey}`}
          empty="No charges for this year."
          columns={[
            { header: "Category", cell: (c) => c.categoryName },
            { header: "Period / event", cell: (c) => periodLabel(c.periodKey) === c.periodKey ? c.label.split(" — ").at(-1) : periodLabel(c.periodKey) },
            { header: "Type", cell: (c) => <Badge>{c.source === "AUTO" ? "Automatic" : "Applied"}</Badge> },
            { header: "Members", align: "right", cell: (c) => c.members },
            { header: "Due", align: "right", cell: (c) => <Money kobo={c.dueKobo} /> },
            { header: "Paid", align: "right", cell: (c) => <Money kobo={c.paidKobo} /> },
            { header: "Outstanding", align: "right", cell: (c) => <Money kobo={c.outstandingKobo} /> },
          ]}
        />
        {canApply ? (
          <Card title="Apply a levy or event charge" description={`Uses the ${year} one-time rate for the category unless you enter an amount.`}>
            <ChargeForm
              year={year}
              categories={categories.map((c) => ({ value: c.id, label: c.name }))}
              members={members.rows.map((m) => ({ value: m.id, label: m.fullName }))}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}
