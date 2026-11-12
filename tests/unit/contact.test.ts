import { describe, expect, it } from "vitest";
import { normalizePhone, parseLoginIdentifier, whatsappShareUrl } from "@/lib/contact";

describe("normalizePhone (stored without the country code)", () => {
  it.each([
    "08031234567",
    "0803 123 4567",
    "0803-123-4567",
    "8031234567",
    "2348031234567",
    "+2348031234567",
    "+234 803 123 4567",
    "+234 (0) 803 123 4567",
    "+23408031234567",
  ])("%s → 08031234567", (input) => {
    expect(normalizePhone(input)).toBe("08031234567");
  });

  it.each(["", "0803123456", "080312345678", "+447911123456", "00000000000", "0803abc4567"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it("sign-in by phone finds the same stored form", () => {
    expect(parseLoginIdentifier("+234 803 123 4567")).toEqual({ kind: "phone", value: "08031234567" });
  });
});

describe("whatsappShareUrl", () => {
  it("opens a chat with a stored local number in international form", () => {
    expect(whatsappShareUrl("Hi there", "08031234567")).toBe("https://wa.me/2348031234567?text=Hi%20there");
  });
  it("lets the sender pick a chat when there is no number", () => {
    expect(whatsappShareUrl("Hi", null)).toBe("https://wa.me/?text=Hi");
  });
});
