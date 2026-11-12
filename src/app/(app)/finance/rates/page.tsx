import type { Metadata } from "next";
import { can } from "@/domain/actor";
import { LABELS } from "@/domain/enums";
import { Permission } from "@/domain/permissions";
import { formatDateTime, toLagosDateOnly, yearOf } from "@/lib/dates";
import { yearFromParams } from "@/lib/validation/query";
import { CopyRatesForm, RateForm } from "@/components/finance-forms";
import { YearPicker } from "@/components/year-picker";
import { Alert, Card, DataTable, Money, PageHeader } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dues & levy rates" };

export default async function RatesPage({ searchParams }: PageProps<"/finance/rates">) {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const thisYear = yearOf(toLagosDateOnly());
  const year = yearFromParams(await searchParams, thisYear);
  const [rates, missing, fixedCategories] = await Promise.all([
    services().rates.listForYear(year),
    services().rates.missingRates(year),
    services().categories.list({ activeOnly: true, pricing: "FIXED" }),
  ]);
  const canEdit = can(actor, Permission.MANAGE_RATES);

  return (
    <>
      <PageHeader
        title={`Dues & levy rates — ${year}`}
        description="Set how much each fixed fee is and how often it is paid, per financial year. Changing next year's rate never changes past records."
        actions={<YearPicker year={year} to={thisYear + 1} />}
      />
      {missing.length ? (
        <div className="mb-4">
          <Alert tone="warning">No {year} rate yet for: {missing.map((c) => c.name).join(", ")}.</Alert>
        </div>
      ) : null}
      <div className="space-y-6">
        <DataTable
          rows={rates}
          rowKey={(r) => r.id}
          empty={`No rates set for ${year}.`}
          columns={[
            { header: "Category", cell: (r) => r.categoryName },
            { header: "Frequency", cell: (r) => LABELS.frequency[r.frequency] },
            { header: "Amount per period", align: "right", cell: (r) => <Money kobo={r.amountKobo} /> },
            { header: "Note", cell: (r) => r.note ?? "—" },
            { header: "Last changed", cell: (r) => formatDateTime(r.updatedAt) },
          ]}
        />
        {canEdit ? (
          <Card
            title={`Set a ${year} rate`}
            description="Changing an amount updates only charges nobody has paid yet. Frequency can't change after dues for the year have been generated."
            actions={<CopyRatesForm year={year} />}
          >
            <RateForm year={year} categories={fixedCategories.map((c) => ({ value: c.id, label: c.name }))} />
          </Card>
        ) : (
          <p className="text-sm text-muted">Only the Financial Officer (or an admin granted “Rates &amp; charges”) can change rates.</p>
        )}
      </div>
    </>
  );
}
