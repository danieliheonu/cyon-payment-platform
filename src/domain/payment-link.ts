import { AmountMode, LinkStatus } from "./enums";
import { RuleError, ValidationError } from "./errors";
import { formatNaira, type Kobo } from "./money";

export interface LinkRules {
  status: LinkStatus;
  closesAt: Date | null;
  targetKobo: Kobo | null;
  autoCloseOnTarget: boolean;
  amountMode: AmountMode;
  amountKobo: Kobo | null;
}

export type LinkAvailability =
  | { open: true }
  | { open: false; reason: "CLOSED" | "EXPIRED" | "TARGET_REACHED"; message: string };

/** Whether a payment link accepts payments. Used by the public page and the submission service. */
export function linkAvailability(link: LinkRules, now: Date, confirmedTotalKobo: Kobo): LinkAvailability {
  if (link.status === LinkStatus.CLOSED) {
    return { open: false, reason: "CLOSED", message: "This payment link has been closed." };
  }
  if (link.closesAt && now >= link.closesAt) {
    return { open: false, reason: "EXPIRED", message: "This payment link has passed its closing date." };
  }
  if (link.autoCloseOnTarget && link.targetKobo !== null && confirmedTotalKobo >= link.targetKobo) {
    return { open: false, reason: "TARGET_REACHED", message: "This collection has reached its target. Thank you!" };
  }
  return { open: true };
}

export function assertLinkOpen(link: LinkRules, now: Date, confirmedTotalKobo: Kobo): void {
  const availability = linkAvailability(link, now, confirmedTotalKobo);
  if (!availability.open) throw new RuleError(availability.message);
}

/** Checks an amount against the link's amount rule. */
export function assertAmountAllowed(link: Pick<LinkRules, "amountMode" | "amountKobo">, amountKobo: Kobo): void {
  if (link.amountMode === AmountMode.FIXED && amountKobo !== link.amountKobo) {
    throw new ValidationError("Amount must match the required amount.", {
      amount: `The amount for this payment is ${formatNaira(link.amountKobo ?? 0)}.`,
    });
  }
  if (link.amountMode === AmountMode.MINIMUM && amountKobo < (link.amountKobo ?? 0)) {
    throw new ValidationError("Amount is below the minimum.", {
      amount: `The minimum amount is ${formatNaira(link.amountKobo ?? 0)}.`,
    });
  }
}

/** Checks the link's own settings when it is created or edited. */
export function assertValidLinkSettings(link: Pick<LinkRules, "amountMode" | "amountKobo" | "targetKobo">): void {
  if (link.amountMode !== AmountMode.OPEN && !(link.amountKobo && link.amountKobo > 0)) {
    throw new ValidationError("Set the amount for this link.", { amount: "Required for fixed or minimum amounts." });
  }
  if (link.targetKobo !== null && link.targetKobo <= 0) {
    throw new ValidationError("Target must be more than zero.", { target: "Must be more than zero." });
  }
}
