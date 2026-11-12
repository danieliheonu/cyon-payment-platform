import type { Metadata } from "next";
import { can } from "@/domain/actor";
import { Permission } from "@/domain/permissions";
import { BankAccountForm } from "@/components/finance-forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Bank accounts" };

export default async function BankAccountsPage() {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const accounts = await services().bankAccounts.list();
  const canEdit = can(actor, Permission.MANAGE_BANK_ACCOUNTS);
  return (
    <>
      <PageHeader title="Receiving bank accounts" description="General accounts are shown to members on the payment page. Link-only accounts appear only on the payment links that use them." />
      <div className="space-y-4">
        {accounts.map((account) => (
          <Card
            key={account.id}
            title={`${account.bankName} · ${account.accountNumber}`}
            description={account.accountName}
            actions={
              <div className="flex gap-2">
                <Badge>{account.usage === "GENERAL" ? "General" : "Payment links only"}</Badge>
                {!account.isActive ? <Badge className="bg-danger-soft text-danger">Inactive</Badge> : null}
              </div>
            }
          >
            {canEdit ? <BankAccountForm account={account} /> : null}
          </Card>
        ))}
        {canEdit ? (
          <Card title="Add an account">
            <BankAccountForm />
          </Card>
        ) : null}
      </div>
    </>
  );
}
