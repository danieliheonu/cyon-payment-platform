import { ValidationError } from "./errors";

/**
 * All money in the system is an integer number of kobo (₦1 = 100 kobo).
 * This module is the only place that converts between naira and kobo.
 */
export type Kobo = number;

const NAIRA_INPUT = /^(\d+)(?:\.(\d{1,2}))?$/;

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function assertKobo(value: number, field = "amount"): Kobo {
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError(`Invalid ${field}.`, { [field]: "Must be a whole number of kobo." });
  }
  return value;
}

/** Parses user input such as "5,000", "₦5000.5" or "250.75" into kobo, without floating-point error. */
export function parseNaira(input: string | number): Kobo {
  const cleaned = String(input).replace(/[₦,\s]/g, "").replace(/^NGN/i, "");
  const match = NAIRA_INPUT.exec(cleaned);
  if (!match) {
    throw new ValidationError("Enter a valid amount in naira, e.g. 5000 or 5000.50.", {
      amount: "Enter a valid amount in naira.",
    });
  }
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return assertKobo(whole * 100 + fraction);
}

/** ₦5,000.00 */
export function formatNaira(kobo: Kobo): string {
  return nairaFormatter.format(kobo / 100);
}

/** "5000.00" — for CSV exports and form default values. */
export function koboToNairaString(kobo: Kobo): string {
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function sumKobo(values: readonly Kobo[]): Kobo {
  return values.reduce((total, value) => total + value, 0);
}

export function isPositiveKobo(value: Kobo): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
