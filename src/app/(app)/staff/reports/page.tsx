import type { Metadata } from "next";
import Link from "next/link";
import { Permission } from "@/domain/permissions";
import { toLagosDateOnly, yearOf, yearRange } from "@/lib/dates";
import { paginate } from "@/lib/pagination";
import { pageFromParams, param, yearFromParams } from "@/lib/validation/query";
import { YearPicker } from "@/components/year-picker";
import { Card, DataTable, LinkButton, Money, PageHeader, Pagination, Stat } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/staff/reports">) {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const params = await searchParams;
  const thisYear = yearOf(toLagosDateOnly());
  const year = yearFromParams(params, thisYear);
  const showAll = param(params, "balances") === "all";
  const [summary, balances] = await Promise.all([
    services().reports.summary(actor, yearRange(year)),
    services().reports.memberBalances(actor, { year }),
  ]);
  const owing = balances.filter((b) => b.outstandingKobo > 0).sort((a, b) => b.outstandingKobo - a.outstandingKobo);
  const rows = paginate(showAll ? balances : owing, pageFromParams(params));
  const pageParams = new URLSearchParams({ year: String(year), ...(showAll ? { balances: "all" } : {}) });
  const { from, to } = yearRange(year);

  return (
    <>
      <PageHeader
        title={`Reports — ${year}`}
        description="Totals count confirmed payments only. Downloads use the same figures as this page."
        actions={<YearPicker year={year} to={thisYear + 1} />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Received (confirmed)" value={<Money kobo={summary.confirmedTotalKobo} />} hint={`${summary.confirmedCount} payments`} tone="brand" />
        <Stat label="Pending confirmation" value={<Money kobo={summary.pendingTotalKobo} />} hint={`${summary.pendingCount} payments`} />
        <Stat label="Outstanding balances" value={<Money kobo={summary.outstandingKobo} />} hint={`${owing.length} members owing`} tone={owing.length ? "warning" : "default"} />
        <Stat label="Yearly summary" value={<Link className="text-brand hover:underline" href={`/staff/reports/year/${year}`}>Open →</Link>} hint="Brought forward + receipts" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card
          title={showAll ? "All member balances" : "Members with outstanding balances"}
          actions={
            <LinkButton size="sm" variant="ghost" href={`/staff/reports?year=${year}${showAll ? "" : "&balances=all"}`}>
              {showAll ? "Only those owing" : "Show everyone"}
            </LinkButton>
          }
        >
          <DataTable
            rows={rows.rows}
            rowKey={(b) => b.memberId}
            empty={showAll ? "No members yet." : "Nobody owes anything for this year."}
            columns={[
              {
                header: "Member",
                cell: (b) => (
                  <Link href={`/staff/members/${b.memberId}`} className="hover:underline">
                    <span className="font-medium">{b.fullName}</span>
                  </Link>
                ),
              },
              { header: "Due", align: "right", cell: (b) => <Money kobo={b.dueKobo} /> },
              { header: "Paid", align: "right", cell: (b) => <Money kobo={b.paidKobo} /> },
              { header: "Outstanding", align: "right", cell: (b) => <Money kobo={b.outstandingKobo} className={b.outstandingKobo ? "font-semibold" : ""} /> },
            ]}
          />
          <Pagination page={rows.page} pageSize={rows.pageSize} total={rows.total} params={pageParams} />
        </Card>

        <div className="space-y-6">
          <Card title="Downloads">
            <ul className="space-y-2 text-sm">
              <li><Link className="text-brand hover:underline" href={`/api/reports/payments?from=${from}&to=${to}`}>All payments {year} (CSV)</Link></li>
              <li><Link className="text-brand hover:underline" href={`/api/reports/payments?from=${from}&to=${to}&status=CONFIRMED`}>Confirmed payments {year} (CSV)</Link></li>
              <li><Link className="text-brand hover:underline" href={`/api/reports/balances?year=${year}`}>Member balances {year} (CSV)</Link></li>
              <li><Link className="text-brand hover:underline" href={`/api/reports/year/${year}`}>Yearly summary {year} (CSV)</Link></li>
              <li><Link className="text-brand hover:underline" href={`/api/reports/year/${year}?format=pdf`}>Yearly summary {year} (PDF)</Link></li>
            </ul>
            <p className="mt-3 text-xs text-muted">For other filters, use <Link className="underline" href="/staff/payments">All payments</Link> and download from there.</p>
          </Card>
          <Card title="Received by category">
            <DataTable
              rows={summary.byCategory}
              rowKey={(c) => c.categoryId}
              empty="Nothing confirmed yet."
              columns={[
                { header: "Category", cell: (c) => c.categoryName },
                { header: "Total", align: "right", cell: (c) => <Money kobo={c.totalKobo} /> },
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
