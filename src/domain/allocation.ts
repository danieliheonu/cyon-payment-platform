import { outstandingKobo } from "./balance";
import { RuleError } from "./errors";
import { formatNaira, sumKobo, type Kobo } from "./money";

export interface AllocatableObligation {
  id: string;
  amountKobo: Kobo;
  allocatedKobo: Kobo;
  /** Oldest first. Period keys sort chronologically; event keys fall back to creation time. */
  sortKey: string;
}

export interface Allocation {
  obligationId: string;
  amountKobo: Kobo;
}

/**
 * Spreads a confirmed payment over a member's open obligations in one category.
 * - If the member picked a period/event (`targetObligationId`), it is filled first.
 * - The rest goes oldest-first (part payments allowed).
 * - Paying more than is outstanding is rejected.
 */
export function allocatePayment(
  amountKobo: Kobo,
  obligations: readonly AllocatableObligation[],
  targetObligationId?: string | null,
): Allocation[] {
  const open = obligations
    .map((o) => ({ ...o, outstanding: outstandingKobo(o) }))
    .filter((o) => o.outstanding > 0)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const totalOutstanding = sumKobo(open.map((o) => o.outstanding));
  if (amountKobo > totalOutstanding) {
    throw new RuleError(
      `This payment (${formatNaira(amountKobo)}) is more than the outstanding balance (${formatNaira(totalOutstanding)}).`,
    );
  }

  if (targetObligationId) {
    const index = open.findIndex((o) => o.id === targetObligationId);
    if (index === -1) throw new RuleError("The selected period is already fully paid.");
    open.unshift(...open.splice(index, 1));
  }

  const allocations: Allocation[] = [];
  let remaining = amountKobo;
  for (const obligation of open) {
    if (remaining === 0) break;
    const amount = Math.min(remaining, obligation.outstanding);
    allocations.push({ obligationId: obligation.id, amountKobo: amount });
    remaining -= amount;
  }
  return allocations;
}
