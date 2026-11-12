import { describe, expect, it } from "vitest";
import { duePeriods, recurrenceFor } from "@/domain/recurrence";
import { periodLabel, eventPeriodKey } from "@/domain/periods";

describe("recurrence strategies", () => {
  it("produces 12 monthly, 4 quarterly, 1 yearly and 0 one-off periods", () => {
    expect(recurrenceFor("MONTHLY").periodsInYear(2026)).toHaveLength(12);
    expect(recurrenceFor("QUARTERLY").periodsInYear(2026).map((p) => p.key)).toEqual([
      "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4",
    ]);
    expect(recurrenceFor("YEARLY").periodsInYear(2026).map((p) => p.key)).toEqual(["2026"]);
    expect(recurrenceFor("ONE_OFF").periodsInYear(2026)).toEqual([]);
  });

  it("handles February in leap years", () => {
    const feb = recurrenceFor("MONTHLY").periodsInYear(2028)[1];
    expect(feb.end).toBe("2028-02-29");
  });

  it("only includes periods that have started", () => {
    const due = duePeriods("MONTHLY", 2026, "2020-01-01", "2026-03-15");
    expect(due.map((p) => p.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("a member joining mid-month owes that month", () => {
    const due = duePeriods("MONTHLY", 2026, "2026-02-20", "2026-04-01");
    expect(due.map((p) => p.key)).toEqual(["2026-02", "2026-03", "2026-04"]);
  });

  it("a member joining mid-quarter starts from that quarter", () => {
    const due = duePeriods("QUARTERLY", 2026, "2026-05-10", "2026-12-31");
    expect(due.map((p) => p.key)).toEqual(["2026-Q2", "2026-Q3", "2026-Q4"]);
  });

  it("switching frequency between years leaves no gaps or overlaps", () => {
    const y1 = duePeriods("MONTHLY", 2026, "2026-01-01", "2027-12-31");
    const y2 = duePeriods("YEARLY", 2027, "2026-01-01", "2027-12-31");
    expect(y1.at(-1)?.end).toBe("2026-12-31");
    expect(y2[0].start).toBe("2027-01-01");
    expect(new Set([...y1, ...y2].map((p) => p.key)).size).toBe(13);
  });

  it("labels periods", () => {
    expect(periodLabel("2026-03")).toBe("March 2026");
    expect(periodLabel("2026-Q4")).toBe("Q4 2026");
    expect(periodLabel("2026")).toBe("2026");
    expect(eventPeriodKey(2026, "Harvest Dinner!")).toBe("2026-harvest-dinner");
  });
});
