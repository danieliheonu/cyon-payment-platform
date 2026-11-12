import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/domain/actor";
import { Permission } from "@/domain/permissions";
import { toLagosDateOnly, yearOf, yearRange } from "@/lib/dates";
import { Alert, Card, DataTable, LinkButton, Money, PageHeader, Stat } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Overview" };

export default async function StaffOverviewPage() {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const year = yearOf(toLagosDateOnly());
  const [summary, yearSummary, missingRates] = await Promise.all([
    services().reports.summary(actor, yearRange(year)),
    services().reports.yearSummary(actor, year),
    services().rates.missingRates(year),
  ]);
  const { summary: ys } = yearSummary;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Financial year ${year} (January–December). Only confirmed payments are counted.`}
        actions={
          can(actor, Permission.CONFIRM_PAYMENTS) && summary.pendingCount ? (
            <LinkButton href="/finance/confirmations">Confirm {summary.pendingCount} pending</LinkButton>
          ) : null
        }
      />
      <div className="mb-6 space-y-3">
        {missingRates.length ? (
          <Alert tone="warning" title={`No ${year} rate set`}>
            {missingRates.map((c) => c.name).join(", ")} — dues won&apos;t be generated until a rate is set on{" "}
            <Link className="underline" href={`/finance/rates?year=${year}`}>Dues &amp; levy rates</Link>.
          </Alert>
        ) : null}
        {!ys.broughtForwardRecorded ? (
          <Alert tone="info">
            The balance brought forward from {year - 1} hasn&apos;t been recorded yet.{" "}
            <Link className="underline" href="/finance/brought-forward">Record it</Link>.
          </Alert>
        ) : null}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Received in ${year}`} value={<Money kobo={summary.confirmedTotalKobo} />} hint={`${summary.confirmedCount} confirmed payments`} tone="brand" />
        <Stat label="Awaiting confirmation" value={summary.pendingCount} hint={<Money kobo={summary.pendingTotalKobo} />} tone={summary.pendingCount ? "warning" : "default"} />
        <Stat label="Outstanding member balances" value={<Money kobo={summary.outstandingKobo} />} />
        <Stat label={`Total funds ${year}`} value={<Money kobo={ys.totalFundsKobo} />} hint="Brought forward + received" />
      </div>
      <Card title={`Received by category, ${year}`} actions={<LinkButton href={`/staff/reports/year/${year}`} variant="ghost" size="sm">Yearly summary</LinkButton>}>
        <DataTable
          rows={summary.byCategory}
          rowKey={(c) => c.categoryId}
          empty="No confirmed payments yet this year."
          columns={[
            { header: "Category", cell: (c) => c.categoryName },
            { header: "Payments", align: "right", cell: (c) => c.count },
            { header: "Total", align: "right", cell: (c) => <Money kobo={c.totalKobo} /> },
          ]}
        />
      </Card>
    </>
  );
}
