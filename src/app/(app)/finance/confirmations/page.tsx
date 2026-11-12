import type { Metadata } from "next";
import { PaymentsTable } from "@/components/payments-table";
import { Alert, PageHeader, Pagination } from "@/components/ui";
import { Permission } from "@/domain/permissions";
import { pageFromParams } from "@/lib/validation/query";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Confirm payments" };

export default async function ConfirmationsPage({ searchParams }: PageProps<"/finance/confirmations">) {
  const actor = await requirePermission(Permission.CONFIRM_PAYMENTS);
  const page = pageFromParams(await searchParams);
  const pending = await services().records.listPayments(actor, { statuses: ["PENDING"] }, page);
  return (
    <>
      <PageHeader title="Confirm payments" description="Pending transfers, oldest payment date last. Open one to view the proof and confirm or reject it." />
      <div className="mb-4">
        <Alert tone="info">Only confirm a payment after you have seen the credit on the bank statement. Confirmed payments count toward totals and balances, and a receipt is issued.</Alert>
      </div>
      <PaymentsTable payments={pending.rows} empty="Nothing is waiting for confirmation." />
      <Pagination page={pending.page} pageSize={pending.pageSize} total={pending.total} params={new URLSearchParams()} />
    </>
  );
}
