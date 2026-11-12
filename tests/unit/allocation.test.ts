import { describe, expect, it } from "vitest";
import { allocatePayment, type AllocatableObligation } from "@/domain/allocation";
import { outstandingKobo, summarizeBalances } from "@/domain/balance";
import { RuleError } from "@/domain/errors";

const obligations: AllocatableObligation[] = [
  { id: "mar", amountKobo: 50000, allocatedKobo: 0, sortKey: "2026-03" },
  { id: "jan", amountKobo: 50000, allocatedKobo: 50000, sortKey: "2026-01" },
  { id: "feb", amountKobo: 50000, allocatedKobo: 20000, sortKey: "2026-02" },
];

describe("allocatePayment", () => {
  it("fills oldest open obligations first, skipping fully paid ones", () => {
    expect(allocatePayment(60000, obligations)).toEqual([
      { obligationId: "feb", amountKobo: 30000 },
      { obligationId: "mar", amountKobo: 30000 },
    ]);
  });

  it("allows part payment", () => {
    expect(allocatePayment(10000, obligations)).toEqual([{ obligationId: "feb", amountKobo: 10000 }]);
  });

  it("fills a chosen period first", () => {
    expect(allocatePayment(60000, obligations, "mar")).toEqual([
      { obligationId: "mar", amountKobo: 50000 },
      { obligationId: "feb", amountKobo: 10000 },
    ]);
  });

  it("rejects overpayment", () => {
    expect(() => allocatePayment(80001, obligations)).toThrow(RuleError);
  });

  it("rejects a chosen period that is already paid", () => {
    expect(() => allocatePayment(100, obligations, "jan")).toThrow(RuleError);
  });
});

describe("balances", () => {
  it("never goes negative", () => {
    expect(outstandingKobo({ amountKobo: 100, allocatedKobo: 150 })).toBe(0);
  });

  it("summarizes due, paid and outstanding", () => {
    expect(summarizeBalances(obligations)).toEqual({
      dueKobo: 150000,
      paidKobo: 70000,
      outstandingKobo: 80000,
    });
  });
});
