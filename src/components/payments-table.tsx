import Link from "next/link";
import { LABELS } from "@/domain/enums";
import { formatDateOnly } from "@/lib/dates";
import type { PaymentRecord } from "@/server/ports/repositories";
import { DataTable, Money, StatusBadge, type Column } from "./ui";

/** The one payments table, used by member history, staff lists, member pages and link pages. */
export function PaymentsTable({ payments, showPayer = true, empty }: { payments: PaymentRecord[]; showPayer?: boolean; empty?: string }) {
  const columns: Column<PaymentRecord>[] = [
    { header: "Date", cell: (p) => <span className="whitespace-nowrap">{formatDateOnly(p.paidOn)}</span> },
    ...(showPayer
      ? [
          {
            header: "Payer",
            cell: (p: PaymentRecord) => (
              <div>
                <p className="font-medium">{p.memberName ?? p.payerName}</p>
                {p.memberId ? null : <p className="text-xs text-muted">{p.paymentLinkId ? "Guest (payment link)" : "Non-member"}</p>}
              </div>
            ),
          },
        ]
      : []),
    {
      header: "Purpose",
      cell: (p) => (
        <div>
          <p>{p.categoryName}</p>
          {p.paymentLinkTitle ? <p className="text-xs text-muted">Link: {p.paymentLinkTitle}</p> : null}
        </div>
      ),
    },
    { header: "Method", cell: (p) => LABELS.paymentMethod[p.method] },
    { header: "Amount", align: "right", cell: (p) => <Money kobo={p.amountKobo} /> },
    { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    {
      header: "Receipt",
      cell: (p) =>
        p.receiptId ? (
          <a className="text-brand underline-offset-2 hover:underline" href={`/api/receipts/${p.receiptId}`}>
            {p.receiptNo}
          </a>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      header: "",
      cell: (p) => (
        <Link className="text-brand underline-offset-2 hover:underline" href={`/payments/${p.id}`}>
          View
        </Link>
      ),
    },
  ];
  return <DataTable columns={columns} rows={payments} rowKey={(p) => p.id} empty={empty ?? "No payments found."} />;
}
