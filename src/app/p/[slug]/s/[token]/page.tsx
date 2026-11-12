import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDateOnly } from "@/lib/dates";
import { Alert, BackLink, Card, Details, LinkButton, Money, StatusBadge } from "@/components/ui";
import { services } from "@/server/container";

export const metadata: Metadata = { title: "Payment status", robots: { index: false } };

/** Private status page for a guest payment; the token in the URL is the only key (stored hashed). */
export default async function GuestStatusPage({ params }: PageProps<"/p/[slug]/s/[token]">) {
  const { slug, token } = await params;
  const payment = await services().records.guestPayment(token);
  if (!payment) notFound();

  return (
    <div className="space-y-6">
      <header>
        <BackLink href={`/p/${slug}`} label="Back to the payment page" />
        <h1 className="text-2xl font-semibold">{payment.paymentLinkTitle ?? "Your payment"}</h1>
        <div className="mt-2"><StatusBadge status={payment.status} /></div>
      </header>
      {payment.status === "PENDING" ? (
        <Alert tone="info" title="Received — awaiting confirmation">
          Bookmark this page. Once the Financial Officer confirms the money has arrived, your receipt can be downloaded here.
        </Alert>
      ) : null}
      {payment.status === "REJECTED" ? <Alert tone="danger" title="Not confirmed">{payment.rejectionReason}</Alert> : null}
      {payment.status === "VOIDED" ? <Alert tone="warning" title="Cancelled">{payment.voidReason}</Alert> : null}
      <Card title="Details">
        <Details
          items={[
            ["Name", payment.payerName],
            ["Purpose", payment.paymentLinkPurpose ?? payment.categoryName],
            ["Amount", <Money key="a" kobo={payment.amountKobo} />],
            ["Payment date", formatDateOnly(payment.paidOn)],
            ["Receipt no", payment.receiptNo],
          ]}
        />
      </Card>
      {payment.receiptId ? (
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/api/guest-receipts/${token}`}>Download receipt</LinkButton>
        </div>
      ) : null}
    </div>
  );
}
