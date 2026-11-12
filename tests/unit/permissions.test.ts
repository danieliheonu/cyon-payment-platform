import { describe, expect, it } from "vitest";
import { Permission, ROLE_PERMISSIONS } from "@/domain/permissions";
import {
  GrantPermissionSource,
  PermissionResolver,
  RolePermissionSource,
  type GrantRecord,
} from "@/server/auth/permission-resolver";
import { canViewMemberRecords, type Actor } from "@/domain/actor";

const now = new Date("2026-11-11T12:00:00Z");

function resolverWith(grants: GrantRecord[]) {
  return new PermissionResolver([
    new RolePermissionSource(),
    new GrantPermissionSource({ grantsForUser: async () => grants }),
  ]);
}

const FINANCE = [
  Permission.CONFIRM_PAYMENTS,
  Permission.RECORD_CASH,
  Permission.CORRECT_PAYMENTS,
  Permission.MANAGE_RATES,
  Permission.MANAGE_CHARGES,
  Permission.MANAGE_BROUGHT_FORWARD,
  Permission.MANAGE_PAYMENT_LINKS,
  Permission.MANAGE_BANK_ACCOUNTS,
];

describe("role permissions", () => {
  it("only the Financial Officer has finance permissions by role", () => {
    for (const p of FINANCE) {
      expect(ROLE_PERMISSIONS.FINANCIAL_OFFICER).toContain(p);
      expect(ROLE_PERMISSIONS.ADMIN).not.toContain(p);
      expect(ROLE_PERMISSIONS.SUPER_ADMIN).not.toContain(p);
      expect(ROLE_PERMISSIONS.MEMBER).not.toContain(p);
    }
  });

  it("only the Super Admin manages grants and users", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(Permission.MANAGE_GRANTS);
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain(Permission.MANAGE_GRANTS);
    expect(ROLE_PERMISSIONS.FINANCIAL_OFFICER).not.toContain(Permission.MANAGE_GRANTS);
  });
});

describe("PermissionResolver", () => {
  it("admin without grants has no finance permissions", async () => {
    const perms = await resolverWith([]).resolve({ id: "u", role: "ADMIN" }, now);
    expect(FINANCE.some((p) => perms.has(p))).toBe(false);
    expect(perms.has(Permission.MANAGE_MEMBERS)).toBe(true);
  });

  it("an active PAYMENTS grant adds only payment permissions", async () => {
    const perms = await resolverWith([{ area: "PAYMENTS", expiresAt: null, revokedAt: null }]).resolve(
      { id: "u", role: "ADMIN" },
      now,
    );
    expect(perms.has(Permission.CONFIRM_PAYMENTS)).toBe(true);
    expect(perms.has(Permission.MANAGE_RATES)).toBe(false);
  });

  it("expired and revoked grants give nothing", async () => {
    const perms = await resolverWith([
      { area: "PAYMENTS", expiresAt: new Date("2026-11-11T11:00:00Z"), revokedAt: null },
      { area: "RATES_CHARGES", expiresAt: null, revokedAt: new Date("2026-11-01") },
    ]).resolve({ id: "u", role: "ADMIN" }, now);
    expect(perms.has(Permission.CONFIRM_PAYMENTS)).toBe(false);
    expect(perms.has(Permission.MANAGE_RATES)).toBe(false);
  });

  it("super admin cannot modify finance without a self-grant", async () => {
    const perms = await resolverWith([]).resolve({ id: "s", role: "SUPER_ADMIN" }, now);
    expect(perms.has(Permission.CONFIRM_PAYMENTS)).toBe(false);
    const granted = await resolverWith([{ area: "BROUGHT_FORWARD", expiresAt: null, revokedAt: null }]).resolve(
      { id: "s", role: "SUPER_ADMIN" },
      now,
    );
    expect(granted.has(Permission.MANAGE_BROUGHT_FORWARD)).toBe(true);
  });

  it("grants are ignored for members and officers", async () => {
    const perms = await resolverWith([{ area: "PAYMENTS", expiresAt: null, revokedAt: null }]).resolve(
      { id: "m", role: "MEMBER" },
      now,
    );
    expect(perms.has(Permission.CONFIRM_PAYMENTS)).toBe(false);
  });
});

describe("member record access", () => {
  const member: Actor = {
    userId: "u1",
    role: "MEMBER",
    memberId: "m1",
    displayName: "Ada",
    permissions: new Set(ROLE_PERMISSIONS.MEMBER),
  };

  it("members see only their own records", () => {
    expect(canViewMemberRecords(member, "m1")).toBe(true);
    expect(canViewMemberRecords(member, "m2")).toBe(false);
    expect(canViewMemberRecords(member, null)).toBe(false);
  });

  it("staff see everyone's", () => {
    const admin: Actor = { ...member, role: "ADMIN", memberId: null, permissions: new Set(ROLE_PERMISSIONS.ADMIN) };
    expect(canViewMemberRecords(admin, "m2")).toBe(true);
  });
});
