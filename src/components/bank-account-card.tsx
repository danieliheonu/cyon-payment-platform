import { cx } from "./ui";

/** How receiving account details are shown to payers (members and public links). */
export function BankAccountCard({
  account,
  className,
}: {
  account: { bankName: string; accountName: string; accountNumber: string };
  className?: string;
}) {
  return (
    <div className={cx("rounded-md border border-border bg-surface-muted p-3", className)}>
      <p className="text-xs uppercase tracking-wide text-muted">{account.bankName}</p>
      <p className="tabular mt-1 font-mono text-lg font-semibold tracking-wider">{account.accountNumber}</p>
      <p className="text-sm">{account.accountName}</p>
    </div>
  );
}
