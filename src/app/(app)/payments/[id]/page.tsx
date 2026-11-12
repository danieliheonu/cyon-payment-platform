import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/domain/actor";
import { LABELS } from "@/domain/enums";
import { koboToNairaString } from "@/domain/money";
import { Permission } from "@/domain/permissions";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { ConfirmForm, CorrectionForm, RejectForm } from "@/components/payment-actions";
import { Alert, Card, DataTable, Details, LinkButton, Money, PageHeader, StatusBadge } from "@/components/ui";
import { services } from "@/server/container";
import { pageData } from "@/server/http/page-data";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Payment" };

/** One payment page for members (their own) and staff (anyone's, with finance actions when permitted). */
export default async function PaymentPage({ params, searchParams }: PageProps<"/payments/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const { submitted } = await searchParams;
  const detail = await pageData(services().records.getPayment(actor, id));
  const { payment, allocations } = detail;
  const isStaff = can(actor, Permission.VIEW_ALL_PAYMENTS);
  const canConfirm = payment.status === "PENDING" && can(actor, Permission.CONFIRM_PAYMENTS);
  const canCorrect = payment.status === "CONFIRMED" && can(actor, Permission.CORRECT_PAYMENTS);

  const [suggestions, categories] = await Promise.all([
    canConfirm ? services().confirmations.suggestMembers(payment) : Promise.resolve([]),
    canCorrect ? services().categories.list() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        back={isStaff ? { href: "/staff/payments", label: "Back to all payments" } : { href: "/history", label: "Back to my payments" }}
        title={`${LABELS.paymentMethod[payment.method]} · ${payment.categoryName}`}
        description={<StatusBadge status={payment.status} />}
        actions={
          <>
            {payment.receiptId ? <LinkButton href={`/api/receipts/${payment.receiptId}`}>Download receipt</LinkButton> : null}
            {payment.proofFileKey ? (
              <LinkButton variant="secondary" href={`/api/proofs/${payment.id}`} target="_blank">
                View proof
              </LinkButton>
            ) : null}
          </>
        }
      />
      {submitted ? (
        <div className="mb-6">
          <Alert tone="success" title="Payment submitted">
            It will show as pending until the Financial Officer confirms the money has arrived. Your receipt will then be available here and in My payments.
          </Alert>
        </div>
      ) : null}
      {payment.status === "REJECTED" ? (
        <div className="mb-6">
          <Alert tone="danger" title="Rejected">{payment.rejectionReason}</Alert>
        </div>
      ) : null}
      {payment.status === "VOIDED" ? (
        <div className="mb-6">
          <Alert tone="warning" title="Voided">
            {payment.voidReason}
            {payment.correctedById ? (
              <>
                {" "}
                · <Link className="underline" href={`/payments/${payment.correctedById}`}>View the corrected payment</Link>
              </>
            ) : null}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Details">
            <Details
              items={[
                ["Amount", <Money key="a" kobo={payment.amountKobo} className="text-lg" />],
                ["Payer", payment.memberName ?? `${payment.payerName} (guest)`],
                ...(isStaff && !payment.memberName ? ([["Payer contact", [payment.payerPhone, payment.payerEmail].filter(Boolean).join(" · ")]] as Array<[string, string]>) : []),
                ["Purpose", payment.paymentLinkPurpose ?? payment.categoryName],
                ["Payment date", formatDateOnly(payment.paidOn)],
                ["Paid into", payment.bankAccountLabel],
                ...(payment.method === "CASH" && payment.transferReference ? ([["Note", payment.transferReference]] as Array<[string, string]>) : []),
                ["Sender", payment.senderName ? `${payment.senderName}, ${payment.senderBank}` : null],
                ["Submitted", formatDateTime(payment.createdAt)],
                ["Confirmed", payment.confirmedAt && payment.status !== "REJECTED" ? formatDateTime(payment.confirmedAt) : null],
                ["Receipt no", payment.receiptNo],
                ...(payment.correctsPaymentId
                  ? ([["Corrects", <Link key="c" className="text-brand underline" href={`/payments/${payment.correctsPaymentId}`}>original payment</Link>]] as Array<[string, React.ReactNode]>)
                  : []),
              ]}
            />
          </Card>
          {allocations.length ? (
            <Card title="Applied to">
              <DataTable
                rows={allocations}
                rowKey={(a) => a.obligationId}
                columns={[
                  { header: "Charge", cell: (a) => a.label },
                  { header: "Amount", align: "right", cell: (a) => <Money kobo={a.amountKobo} /> },
                ]}
              />
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {canConfirm ? (
            <>
              <Card title="Confirm" description="Check the bank statement for this credit before confirming.">
                <ConfirmForm paymentId={payment.id} memberSuggestions={suggestions.map((m) => ({ value: m.id, label: m.fullName }))} />
              </Card>
              <Card title="Reject">
                <RejectForm paymentId={payment.id} />
              </Card>
            </>
          ) : null}
          {canCorrect ? (
            <Card title="Correct or void" description="The original is kept and marked voided; a new receipt is issued.">
              <CorrectionForm
                paymentId={payment.id}
                categories={categories.map((c) => ({ value: c.id, label: c.name }))}
                current={{ amount: koboToNairaString(payment.amountKobo), paidOn: payment.paidOn, categoryId: payment.categoryId }}
              />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
