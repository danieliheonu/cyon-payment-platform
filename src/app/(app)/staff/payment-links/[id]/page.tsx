import type { Metadata } from "next";
import QRCode from "qrcode";
import { can } from "@/domain/actor";
import { LABELS } from "@/domain/enums";
import { formatNaira } from "@/domain/money";
import { Permission } from "@/domain/permissions";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { pageFromParams } from "@/lib/validation/query";
import { BankAccountCard } from "@/components/bank-account-card";
import { CopyButton } from "@/components/forms";
import { PaymentsTable } from "@/components/payments-table";
import { Alert, Card, Details, LinkButton, Money, PageHeader, Pagination, Stat } from "@/components/ui";
import { whatsappShareUrl } from "@/lib/contact";
import { services } from "@/server/container";
import { pageData } from "@/server/http/page-data";
import { requirePermission } from "@/server/auth/session";
import { LinkStatusForm } from "../payment-link-form";

export const metadata: Metadata = { title: "Payment link" };

export default async function PaymentLinkPage({ params, searchParams }: PageProps<"/staff/payment-links/[id]">) {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const { id } = await params;
  const link = await pageData(services().paymentLinks.get(actor, id));
  const payments = await services().records.listPayments(actor, { paymentLinkId: link.id }, pageFromParams(await searchParams));
  const availability = services().paymentLinks.availability(link);
  const url = `${env().APP_URL}/p/${link.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 180 });
  const whatsapp = whatsappShareUrl(`${link.title}\n${link.purpose}\n\nPay here: ${url}`);

  return (
    <>
      <PageHeader
        back={{ href: "/staff/payment-links", label: "Back to payment links" }}
        title={link.title}
        description={`${link.categoryName} · ${LABELS.amountMode[link.amountMode]}${link.amountKobo ? ` ${formatNaira(link.amountKobo)}` : ""}`}
        actions={<LinkButton variant="secondary" href={`/api/reports/payments?linkId=${link.id}`}>Download CSV</LinkButton>}
      />
      {!availability.open ? (
        <div className="mb-4">
          <Alert tone="warning">{availability.message}</Alert>
        </div>
      ) : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Confirmed" value={<Money kobo={link.confirmedTotalKobo} />} hint={`${link.confirmedCount} payments`} tone="brand" />
        <Stat label="Pending confirmation" value={link.pendingCount} />
        <Stat label="Target" value={link.targetKobo ? <Money kobo={link.targetKobo} /> : "—"} hint={link.targetKobo ? `${Math.min(100, Math.round((link.confirmedTotalKobo / link.targetKobo) * 100))}% reached` : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card title="Share">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="h-[180px] w-[180px] shrink-0 rounded-md bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code for the payment link" />
              <div className="min-w-0 space-y-3">
                <code className="block break-all rounded bg-surface-muted px-2 py-1 text-sm">{url}</code>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={url} label="Copy link" />
                  <LinkButton size="sm" variant="secondary" href={whatsapp} target="_blank" rel="noopener noreferrer">
                    Share on WhatsApp
                  </LinkButton>
                  <LinkButton size="sm" variant="ghost" href={`/p/${link.slug}`} target="_blank">
                    Open
                  </LinkButton>
                </div>
              </div>
            </div>
          </Card>
          <Card title="Payments">
            <PaymentsTable payments={payments.rows} />
            <Pagination page={payments.page} pageSize={payments.pageSize} total={payments.total} params={new URLSearchParams()} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Details">
            <Details
              items={[
                ["Purpose", link.purpose],
                ["Closes", link.closesAt ? formatDateTime(link.closesAt) : "When closed manually"],
                ["Auto-close at target", link.autoCloseOnTarget ? "Yes" : "No"],
                ["Created", formatDateTime(link.createdAt)],
              ]}
            />
          </Card>
          <Card title="Receiving account">
            <BankAccountCard account={link.bankAccount} />
          </Card>
          {can(actor, Permission.MANAGE_PAYMENT_LINKS) ? (
            <Card title={link.status === "OPEN" ? "Close" : "Reopen"}>
              <LinkStatusForm linkId={link.id} open={link.status === "OPEN"} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
