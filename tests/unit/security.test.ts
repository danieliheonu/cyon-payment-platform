import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { password } from "@/lib/validation/fields";

describe("safeRedirectPath (post-login redirect)", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/staff/payments?status=PENDING#top", "/staff/payments?status=PENDING#top"],
    ["/a\\b", "/a/b"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "\\\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", null, 42])(
    "rejects %s",
    (input) => {
      expect(safeRedirectPath(input)).toBeNull();
    },
  );
});

describe("password rules", () => {
  it("rejects passwords bcrypt would truncate (over 72 bytes)", () => {
    expect(password.safeParse(`a1${"x".repeat(70)}`).success).toBe(true);
    expect(password.safeParse(`a1${"x".repeat(71)}`).success).toBe(false);
    expect(password.safeParse(`a1${"₦".repeat(24)}`).success).toBe(false); // 2 + 72 bytes
  });
});
