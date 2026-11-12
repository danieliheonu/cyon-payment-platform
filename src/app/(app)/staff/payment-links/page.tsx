import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/domain/actor";
import { LABELS } from "@/domain/enums";
import { Permission } from "@/domain/permissions";
import { Badge, Card, DataTable, Money, PageHeader, Pagination } from "@/components/ui";
import { paginate } from "@/lib/pagination";
import { pageFromParams } from "@/lib/validation/query";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";
import { PaymentLinkForm } from "./payment-link-form";

export const metadata: Metadata = { title: "Payment links" };

export default async function PaymentLinksPage({ searchParams }: PageProps<"/staff/payment-links">) {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const canCreate = can(actor, Permission.MANAGE_PAYMENT_LINKS);
  const [allLinks, categories, accounts] = await Promise.all([
    services().paymentLinks.list(actor),
    canCreate ? services().categories.list({ activeOnly: true }) : Promise.resolve([]),
    canCreate ? services().bankAccounts.list({ activeOnly: true }) : Promise.resolve([]),
  ]);
  const links = paginate(allLinks, pageFromParams(await searchParams));

  return (
    <>
      <PageHeader title="Payment links" description="Shareable links for one-time collections. Anyone with the link can pay — no login needed — and every payment still needs proof and confirmation." />
      <div className="space-y-6">
        <div>
          <DataTable
            rows={links.rows}
            rowKey={(l) => l.id}
            empty="No payment links yet."
            columns={[
              {
                header: "Link",
                cell: (l) => (
                  <div>
                    <Link href={`/staff/payment-links/${l.id}`} className="font-medium text-brand hover:underline">{l.title}</Link>
                    <p className="text-xs text-muted">{l.categoryName} · {LABELS.amountMode[l.amountMode]}</p>
                </div>
              ),
            },
            { header: "Status", cell: (l) => { const a = services().paymentLinks.availability(l); return <Badge className={a.open ? "bg-success-soft text-success" : undefined}>{a.open ? "Open" : "Closed"}</Badge>; } },
            { header: "Pending", align: "right", cell: (l) => l.pendingCount },
            { header: "Confirmed", align: "right", cell: (l) => <Money kobo={l.confirmedTotalKobo} /> },
            { header: "Target", align: "right", cell: (l) => (l.targetKobo ? <Money kobo={l.targetKobo} /> : "—") },
          ]}
        />
        <Pagination page={links.page} pageSize={links.pageSize} total={links.total} params={new URLSearchParams()} />
        </div>
        {canCreate ? (
          <Card title="Create a payment link">
            <PaymentLinkForm
              categories={categories.map((c) => ({ value: c.id, label: c.name }))}
              accounts={accounts.map((a) => ({ value: a.id, label: `${a.bankName} ${a.accountNumber} — ${a.accountName}` }))}
            />
          </Card>
        ) : (
          <p className="text-sm text-muted">Only the Financial Officer (or an admin granted “Payment links &amp; bank accounts”) can create links.</p>
        )}
      </div>
    </>
  );
}
