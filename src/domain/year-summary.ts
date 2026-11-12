import { sumKobo, type Kobo } from "./money";

export interface CategoryReceipts {
  categoryId: string;
  categoryName: string;
  totalKobo: Kobo; // confirmed payments only
  count: number;
}

export interface YearSummaryInput {
  year: number;
  /** null when finance staff have not recorded it yet */
  broughtForwardKobo: Kobo | null;
  receiptsByCategory: readonly CategoryReceipts[];
  outstandingKobo: Kobo;
}

export interface YearSummary {
  year: number;
  broughtForwardKobo: Kobo;
  broughtForwardRecorded: boolean;
  receiptsByCategory: CategoryReceipts[];
  totalReceiptsKobo: Kobo;
  /** brought forward + confirmed receipts. Spending is not tracked by the platform. */
  totalFundsKobo: Kobo;
  outstandingKobo: Kobo;
}

/** The single yearly-summary calculation, used by the page, CSV and PDF. */
export function buildYearSummary(input: YearSummaryInput): YearSummary {
  const broughtForwardKobo = input.broughtForwardKobo ?? 0;
  const receiptsByCategory = [...input.receiptsByCategory].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName),
  );
  const totalReceiptsKobo = sumKobo(receiptsByCategory.map((c) => c.totalKobo));
  return {
    year: input.year,
    broughtForwardKobo,
    broughtForwardRecorded: input.broughtForwardKobo !== null,
    receiptsByCategory,
    totalReceiptsKobo,
    totalFundsKobo: broughtForwardKobo + totalReceiptsKobo,
    outstandingKobo: input.outstandingKobo,
  };
}
