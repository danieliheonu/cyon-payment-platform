import { describe, expect, it } from "vitest";
import { categoriesMissingRate, findRate } from "@/domain/rates";
import { buildYearSummary } from "@/domain/year-summary";
import { assertAmountAllowed, linkAvailability, type LinkRules } from "@/domain/payment-link";
import { RuleError, ValidationError } from "@/domain/errors";

describe("rates", () => {
  const rates = [
    { categoryId: "dues", year: 2026, frequency: "MONTHLY" as const, amountKobo: 50000 },
    { categoryId: "dues", year: 2027, frequency: "YEARLY" as const, amountKobo: 500000 },
  ];

  it("finds the rate for the right year", () => {
    expect(findRate(rates, "dues", 2027)?.amountKobo).toBe(500000);
    expect(findRate(rates, "dues", 2028)).toBeNull();
  });

  it("reports fixed categories with no rate", () => {
    expect(categoriesMissingRate(["dues", "levy"], rates, 2026)).toEqual(["levy"]);
  });
});

describe("year summary", () => {
  it("total funds = brought forward + confirmed receipts", () => {
    const summary = buildYearSummary({
      year: 2026,
      broughtForwardKobo: 1_000_000,
      receiptsByCategory: [
        { categoryId: "b", categoryName: "Levy", totalKobo: 300_000, count: 3 },
        { categoryId: "a", categoryName: "Dues", totalKobo: 200_000, count: 4 },
      ],
      outstandingKobo: 50_000,
    });
    expect(summary.totalReceiptsKobo).toBe(500_000);
    expect(summary.totalFundsKobo).toBe(1_500_000);
    expect(summary.receiptsByCategory.map((c) => c.categoryName)).toEqual(["Dues", "Levy"]);
    expect(summary.broughtForwardRecorded).toBe(true);
  });

  it("flags a missing brought-forward figure", () => {
    const summary = buildYearSummary({ year: 2026, broughtForwardKobo: null, receiptsByCategory: [], outstandingKobo: 0 });
    expect(summary.broughtForwardRecorded).toBe(false);
    expect(summary.totalFundsKobo).toBe(0);
  });
});

describe("payment link availability", () => {
  const base: LinkRules = {
    status: "OPEN",
    closesAt: null,
    targetKobo: null,
    autoCloseOnTarget: false,
    amountMode: "OPEN",
    amountKobo: null,
  };
  const now = new Date("2026-11-11T12:00:00Z");

  it("is open by default", () => {
    expect(linkAvailability(base, now, 0)).toEqual({ open: true });
  });

  it("closes when closed manually", () => {
    expect(linkAvailability({ ...base, status: "CLOSED" }, now, 0)).toMatchObject({ open: false, reason: "CLOSED" });
  });

  it("closes after the closing date", () => {
    expect(linkAvailability({ ...base, closesAt: new Date("2026-11-11T11:59:59Z") }, now, 0)).toMatchObject({
      reason: "EXPIRED",
    });
    expect(linkAvailability({ ...base, closesAt: new Date("2026-11-12T00:00:00Z") }, now, 0).open).toBe(true);
  });

  it("closes at target only when auto-close is on", () => {
    expect(linkAvailability({ ...base, targetKobo: 1000, autoCloseOnTarget: true }, now, 1000)).toMatchObject({
      reason: "TARGET_REACHED",
    });
    expect(linkAvailability({ ...base, targetKobo: 1000, autoCloseOnTarget: false }, now, 5000).open).toBe(true);
  });

  it("validates amount rules", () => {
    expect(() => assertAmountAllowed({ amountMode: "FIXED", amountKobo: 500 }, 400)).toThrow(ValidationError);
    expect(() => assertAmountAllowed({ amountMode: "FIXED", amountKobo: 500 }, 500)).not.toThrow();
    expect(() => assertAmountAllowed({ amountMode: "MINIMUM", amountKobo: 500 }, 499)).toThrow(ValidationError);
    expect(() => assertAmountAllowed({ amountMode: "MINIMUM", amountKobo: 500 }, 900)).not.toThrow();
    expect(() => assertAmountAllowed({ amountMode: "OPEN", amountKobo: null }, 1)).not.toThrow();
  });

  it("RuleError is distinct from ValidationError", () => {
    expect(new RuleError("x")).not.toBeInstanceOf(ValidationError);
  });
});
