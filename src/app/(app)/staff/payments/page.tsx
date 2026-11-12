import type { Metadata } from "next";
import { can } from "@/domain/actor";
import { Permission } from "@/domain/permissions";
import { FilterBar, paymentFilterFields } from "@/components/filter-bar";
import { PaymentsTable } from "@/components/payments-table";
import { LinkButton, Money, PageHeader, Pagination } from "@/components/ui";
import { pageFromParams, param, paramsFromPaymentQuery, paymentQueryFromParams } from "@/lib/validation/query";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "All payments" };

export default async function StaffPaymentsPage({ searchParams }: PageProps<"/staff/payments">) {
  const actor = await requirePermission(Permission.VIEW_ALL_PAYMENTS);
  const params = await searchParams;
  const query = paymentQueryFromParams(params);
  const [result, totals, categories] = await Promise.all([
    services().records.listPayments(actor, query, pageFromParams(params)),
    services().reports.summary(actor, query),
    services().categories.list(),
  ]);
  const csvParams = paramsFromPaymentQuery(query);

  return (
    <>
      <PageHeader
        title="All payments"
        description={
          <>
            Confirmed total for these filters: <Money kobo={totals.confirmedTotalKobo} className="font-semibold text-foreground" /> ({totals.confirmedCount} payments)
          </>
        }
        actions={
          <>
            {can(actor, Permission.RECORD_CASH) ? <LinkButton href="/finance/cash" variant="secondary">Record cash</LinkButton> : null}
            <LinkButton href={`/api/reports/payments?${csvParams}`} variant="secondary">Download CSV</LinkButton>
          </>
        }
      />
      <FilterBar
        keep={{ pageSize: param(params, "pageSize") }}
        fields={paymentFilterFields(categories.map((c) => ({ value: c.id, label: c.name })))}
        values={{ q: query.search, categoryId: query.categoryId, status: query.statuses?.[0], method: query.method, from: query.from, to: query.to }}
      />
      <PaymentsTable payments={result.rows} />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={csvParams} />
    </>
  );
}
