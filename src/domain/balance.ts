import { sumKobo, type Kobo } from "./money";

/**
 * The one place outstanding balances are computed.
 * `allocatedKobo` must only include allocations of CONFIRMED payments
 * (allocations are written at confirmation, so that holds by construction).
 */
export interface ObligationBalanceInput {
  amountKobo: Kobo;
  allocatedKobo: Kobo;
}

export function outstandingKobo({ amountKobo, allocatedKobo }: ObligationBalanceInput): Kobo {
  return Math.max(0, amountKobo - allocatedKobo);
}

export interface BalanceSummary {
  dueKobo: Kobo;
  paidKobo: Kobo;
  outstandingKobo: Kobo;
}

export function summarizeBalances(obligations: readonly ObligationBalanceInput[]): BalanceSummary {
  return {
    dueKobo: sumKobo(obligations.map((o) => o.amountKobo)),
    paidKobo: sumKobo(obligations.map((o) => Math.min(o.allocatedKobo, o.amountKobo))),
    outstandingKobo: sumKobo(obligations.map(outstandingKobo)),
  };
}
