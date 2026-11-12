import type { CategoryBalance } from "@/server/services/obligation.service";
import { DataTable, Money } from "./ui";

/** Balances per category — used on the member dashboard and on staff member pages. */
export function BalancesTable({ balances }: { balances: CategoryBalance[] }) {
  return (
    <DataTable
      rows={balances}
      rowKey={(b) => b.categoryId}
      empty="No dues or charges yet."
      columns={[
        {
          header: "Category",
          cell: (b) => (
            <div>
              <p className="font-medium">{b.categoryName}</p>
              {b.open.length ? (
                <p className="text-xs text-muted">Unpaid: {b.open.map((o) => o.label.split(" — ").at(-1)).join(", ")}</p>
              ) : (
                <p className="text-xs text-success">Fully paid</p>
              )}
            </div>
          ),
        },
        { header: "Due", align: "right", cell: (b) => <Money kobo={b.dueKobo} /> },
        { header: "Paid", align: "right", cell: (b) => <Money kobo={b.paidKobo} /> },
        { header: "Outstanding", align: "right", cell: (b) => <Money kobo={b.outstandingKobo} className={b.outstandingKobo ? "font-semibold" : ""} /> },
      ]}
    />
  );
}
