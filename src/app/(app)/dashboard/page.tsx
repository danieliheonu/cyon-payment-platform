import type { Metadata } from "next";
import { summarizeBalances } from "@/domain/balance";
import { BalancesTable } from "@/components/balances";
import { PaymentsTable } from "@/components/payments-table";
import { Alert, Card, LinkButton, Money, PageHeader, Stat } from "@/components/ui";
import { services } from "@/server/container";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireActor();
  if (!actor.memberId) {
    return <Alert tone="info">Your account is not linked to a member record, so there are no personal dues to show.</Alert>;
  }
  const [balances, recent, pending] = await Promise.all([
    services().obligations.balancesByCategory(actor.memberId),
    services().records.listPayments(actor, {}, { page: 1, pageSize: 5 }),
    services().records.listPayments(actor, { statuses: ["PENDING"] }, { page: 1, pageSize: 1 }),
  ]);
  const total = summarizeBalances(balances.map((b) => ({ amountKobo: b.dueKobo, allocatedKobo: b.paidKobo })));

  return (
    <>
      <PageHeader
        title={`Welcome, ${actor.displayName.split(" ")[0]}`}
        description="Your dues, payments and receipts in one place."
        actions={<LinkButton href="/pay">Make a payment</LinkButton>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding balance" value={<Money kobo={total.outstandingKobo} />} tone={total.outstandingKobo ? "warning" : "brand"} />
        <Stat label="Total paid (confirmed)" value={<Money kobo={total.paidKobo} />} />
        <Stat label="Awaiting confirmation" value={pending.total} hint="Transfers are confirmed by the Financial Officer." />
      </div>
      <div className="space-y-6">
        <Card title="Balances by category">
          <BalancesTable balances={balances} />
        </Card>
        <Card title="Recent payments" actions={<LinkButton href="/history" variant="ghost" size="sm">See all</LinkButton>}>
          <PaymentsTable payments={recent.rows} showPayer={false} empty="You haven't made any payments yet." />
        </Card>
      </div>
    </>
  );
}
