import type { Metadata } from "next";
import { FilterBar, paymentFilterFields } from "@/components/filter-bar";
import { PaymentsTable } from "@/components/payments-table";
import { PageHeader, Pagination } from "@/components/ui";
import { pageFromParams, param, paramsFromPaymentQuery, paymentQueryFromParams } from "@/lib/validation/query";
import { services } from "@/server/container";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "My payments" };

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const actor = await requireActor();
  const params = await searchParams;
  const query = paymentQueryFromParams(params);
  const page = pageFromParams(params);
  const [result, categories] = await Promise.all([
    services().records.listPayments(actor, query, page),
    services().categories.list(),
  ]);
  return (
    <>
      <PageHeader title="My payments" description="Every payment you have made, with receipts for confirmed payments." />
      <FilterBar
        keep={{ pageSize: param(params, "pageSize") }}
        fields={paymentFilterFields(categories.map((c) => ({ value: c.id, label: c.name })), { search: false })}
        values={{ categoryId: query.categoryId, status: query.statuses?.[0], method: query.method, from: query.from, to: query.to }}
      />
      <PaymentsTable payments={result.rows} showPayer={false} />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={paramsFromPaymentQuery(query)} />
    </>
  );
}
