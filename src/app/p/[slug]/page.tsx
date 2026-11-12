import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LABELS } from "@/domain/enums";
import { formatNaira } from "@/domain/money";
import { formatDateTime, toLagosDateOnly } from "@/lib/dates";
import { BankAccountCard } from "@/components/bank-account-card";
import { Alert, Card, Money } from "@/components/ui";
import { services } from "@/server/container";
import { LinkPayForm } from "./link-pay-form";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const link = await services().paymentLinks.publicView(slug);
  return { title: link?.title ?? "Payment link", robots: { index: false } };
}

/** Public page for a payment link: purpose, where to pay, the amount rule and progress. */
export default async function PublicLinkPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  await connection(); // open/closed depends on the current time and confirmed totals
  const link = await services().paymentLinks.publicView(slug);
  if (!link) notFound();
  const { availability } = link;
  const progress = link.targetKobo ? Math.min(100, Math.round((link.confirmedTotalKobo / link.targetKobo) * 100)) : null;
  const amountRule =
    link.amountMode === "FIXED" ? `Amount: ${formatNaira(link.amountKobo ?? 0)}` : link.amountMode === "MINIMUM" ? `Minimum: ${formatNaira(link.amountKobo ?? 0)}` : "Pay any amount";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-brand">{link.orgName}</p>
        <h1 className="mt-1 text-2xl font-semibold">{link.title}</h1>
        <p className="mt-2 whitespace-pre-line text-muted">{link.purpose}</p>
        <p className="mt-3 text-sm">
          <span className="font-medium">{amountRule}</span>
          {link.closesAt ? <span className="text-muted"> · closes {formatDateTime(link.closesAt)}</span> : null}
        </p>
      </header>

      {progress !== null ? (
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span><Money kobo={link.confirmedTotalKobo} /> raised</span>
            <span className="text-muted">of <Money kobo={link.targetKobo ?? 0} /></span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">Counts confirmed payments only.</p>
        </div>
      ) : null}

      {availability.open ? (
        <>
          <Card title="1. Transfer to this account">
            <BankAccountCard account={link.bankAccount} />
            <p className="mt-2 text-xs text-muted">Pay by bank transfer, then fill the form below with your transfer details and a screenshot of the receipt.</p>
          </Card>
          <Card title="2. Tell us about your payment">
            <LinkPayForm slug={link.slug} today={toLagosDateOnly()} fixedAmount={link.amountMode === "FIXED" ? link.amountKobo : null} amountLabel={link.amountMode === "MINIMUM" ? `Amount (₦, at least ${formatNaira(link.amountKobo ?? 0)})` : "Amount (₦)"} />
          </Card>
          <p className="text-center text-xs text-muted">
            Your payment shows as pending until the {LABELS.role.FINANCIAL_OFFICER} confirms the money has arrived. You&apos;ll get a private page to check its status and download your receipt.
          </p>
        </>
      ) : (
        <Alert tone="warning" title="Not accepting payments">{availability.message}</Alert>
      )}
    </div>
  );
}
