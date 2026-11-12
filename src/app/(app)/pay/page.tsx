import type { Metadata } from "next";
import { Alert, PageHeader } from "@/components/ui";
import { toLagosDateOnly } from "@/lib/dates";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";
import { Permission } from "@/domain/permissions";
import { PayForm, type PayCategory } from "./pay-form";

export const metadata: Metadata = { title: "Make a payment" };

export default async function PayPage() {
  const actor = await requirePermission(Permission.PAY_OWN);
  if (!actor.memberId) return <Alert tone="info">Your account is not linked to a member record.</Alert>;

  const [categories, balances, accounts] = await Promise.all([
    services().categories.list({ activeOnly: true }),
    services().obligations.balancesByCategory(actor.memberId),
    services().bankAccounts.list({ usage: "GENERAL", activeOnly: true }),
  ]);

  const payable: PayCategory[] = categories
    .map((c) => {
      const balance = balances.find((b) => b.categoryId === c.id);
      return {
        id: c.id,
        name: c.name,
        fixed: c.pricing === "FIXED",
        outstandingKobo: balance?.outstandingKobo ?? 0,
        open: (balance?.open ?? []).map((o) => ({ id: o.id, label: o.label, outstandingKobo: o.outstandingKobo })),
      };
    })
    // Fixed-amount categories only appear when something is owed.
    .filter((c) => !c.fixed || c.outstandingKobo > 0);

  return (
    <>
      <PageHeader
        title="Make a payment"
        description="Transfer to a CYON account, then submit the details and proof here. Your payment shows as pending until the Financial Officer confirms the money arrived."
      />
      {accounts.length === 0 ? (
        <Alert tone="warning">No receiving bank account has been set up yet. Please check back later.</Alert>
      ) : payable.length === 0 ? (
        <Alert tone="success">You have nothing outstanding right now.</Alert>
      ) : (
        <PayForm categories={payable} accounts={accounts} today={toLagosDateOnly()} />
      )}
    </>
  );
}
