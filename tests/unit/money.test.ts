import { describe, expect, it } from "vitest";
import { formatNaira, koboToNairaString, parseNaira, sumKobo } from "@/domain/money";
import { ValidationError } from "@/domain/errors";

describe("money", () => {
  it.each([
    ["5000", 500000],
    ["5,000", 500000],
    ["₦5,000.5", 500050],
    ["250.75", 25075],
    ["0.01", 1],
    [1200, 120000],
  ])("parses %s to %i kobo", (input, kobo) => {
    expect(parseNaira(input)).toBe(kobo);
  });

  it.each(["", "abc", "1.234", "-5", "5.", "1e3"])("rejects %s", (input) => {
    expect(() => parseNaira(input)).toThrow(ValidationError);
  });

  it("formats kobo as naira", () => {
    expect(formatNaira(500050)).toMatch(/₦\s?5,000\.50/);
  });

  it("converts kobo to plain naira strings for CSV", () => {
    expect(koboToNairaString(500005)).toBe("5000.05");
    expect(koboToNairaString(7)).toBe("0.07");
  });

  it("sums kobo", () => {
    expect(sumKobo([100, 250, 1])).toBe(351);
    expect(sumKobo([])).toBe(0);
  });
});
