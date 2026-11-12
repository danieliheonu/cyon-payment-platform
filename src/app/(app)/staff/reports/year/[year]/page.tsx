import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/actor";
import { LABELS } from "@/domain/enums";
import { Permission } from "@/domain/permissions";
import { toLagosDateOnly, yearOf } from "@/lib/dates";
import { yearFromParams } from "@/lib/validation/query";
import { Alert, Card, DataTable, LinkButton, Money, PageHeader } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Yearly summary" };

/** Staff-only financial summary: brought forward + confirmed receipts = total funds. */
export default async function YearSummaryPage({ params }: PageProps<"/staff/reports/year/[year]">) {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const raw = (await params).year;
  const year = yearFromParams({ year: raw }, NaN);
  if (Number.isNaN(year)) notFound();
  const { summary, rates } = await services().reports.yearSummary(actor, year);
  const thisYear = yearOf(toLagosDateOnly());

  return (
    <>
      <PageHeader
        back={{ href: "/staff/reports", label: "Back to reports" }}
        title={`Financial summary — ${year}`}
        description="January to December. Receipts count confirmed payments only. Spending is not recorded on this platform."
        actions={
          <>
            <LinkButton variant="secondary" href={`/api/reports/year/${year}`}>CSV</LinkButton>
            <LinkButton href={`/api/reports/year/${year}?format=pdf`}>Download PDF</LinkButton>
          </>
        }
      />
      <nav className="mb-4 flex gap-3 text-sm">
        <Link className="text-brand hover:underline" href={`/staff/reports/year/${year - 1}`}>← {year - 1}</Link>
        {year < thisYear + 1 ? <Link className="text-brand hover:underline" href={`/staff/reports/year/${year + 1}`}>{year + 1} →</Link> : null}
      </nav>
      {!summary.broughtForwardRecorded ? (
        <div className="mb-6">
          <Alert tone="warning" title="Brought forward not recorded">
            The balance brought forward from {year - 1} is counted as ₦0 until it is recorded
            {can(actor, Permission.MANAGE_BROUGHT_FORWARD) ? (
              <>
                {" "}on <Link className="underline" href={`/finance/brought-forward?year=${year}`}>Brought forward</Link>
              </>
            ) : null}
            .
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Statement">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2">Balance brought forward from {year - 1}</td>
                <td className="py-2 text-right"><Money kobo={summary.broughtForwardKobo} /></td>
              </tr>
              {summary.receiptsByCategory.map((c) => (
                <tr key={c.categoryId}>
                  <td className="py-2 pl-4 text-muted">Received: {c.categoryName} <span className="text-xs">({c.count})</span></td>
                  <td className="py-2 text-right"><Money kobo={c.totalKobo} /></td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2">Total received (confirmed)</td>
                <td className="py-2 text-right"><Money kobo={summary.totalReceiptsKobo} /></td>
              </tr>
              <tr className="text-base font-semibold">
                <td className="py-3">Total funds</td>
                <td className="py-3 text-right"><Money kobo={summary.totalFundsKobo} /></td>
              </tr>
              <tr className="text-muted">
                <td className="py-2">Outstanding member balances (not yet received)</td>
                <td className="py-2 text-right"><Money kobo={summary.outstandingKobo} /></td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Card title={`Rates for ${year}`}>
          <DataTable
            rows={rates}
            rowKey={(r) => r.id}
            empty="No rates set for this year."
            columns={[
              { header: "Category", cell: (r) => r.categoryName },
              { header: "Rate", align: "right", cell: (r) => <span><Money kobo={r.amountKobo} /> <span className="text-xs text-muted">{LABELS.frequency[r.frequency].toLowerCase()}</span></span> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
