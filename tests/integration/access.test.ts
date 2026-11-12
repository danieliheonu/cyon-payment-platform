import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, RuleError } from "@/domain/errors";
import { Permission } from "@/domain/permissions";
import { bcryptHasher } from "@/server/auth/crypto";
import type { UnitOfWork } from "@/server/ports/repositories";
import { MemberService } from "@/server/services/member.service";
import type { DuesGenerator } from "@/server/services/obligation.service";
import { createHarness, MEMBER_DEFAULT_PASSWORD } from "../support/harness";

const h = createHarness();

beforeEach(() => h.reset());
afterAll(() => h.prisma.$disconnect());

describe("finance access (only Financial Officer unless Super Admin grants)", () => {
  it("an Admin without a grant cannot touch financial records", async () => {
    const admin = await h.actor("ADMIN");
    expect(admin.permissions.has(Permission.CONFIRM_PAYMENTS)).toBe(false);
    await expect(h.services.confirmations.confirm(admin, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      h.services.financialYears.setBroughtForward(admin, { year: 2026, amount: 100, note: null, reason: undefined }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a PAYMENTS grant allows confirming but not setting rates; revoke takes effect immediately", async () => {
    const superAdmin = await h.actor("SUPER_ADMIN");
    let admin = await h.actor("ADMIN");

    const [grant] = await h.services.access.grant(superAdmin, {
      userId: admin.userId,
      areas: ["PAYMENTS"],
      expiresOn: null,
      reason: "Treasurer on leave",
    });
    admin = await h.refresh(admin);
    expect(admin.permissions.has(Permission.CONFIRM_PAYMENTS)).toBe(true);
    expect(admin.permissions.has(Permission.MANAGE_RATES)).toBe(false);

    await h.services.access.revoke(superAdmin, grant.id, "Treasurer back");
    admin = await h.refresh(admin);
    expect(admin.permissions.has(Permission.CONFIRM_PAYMENTS)).toBe(false);

    const audit = await h.prisma.auditLog.findMany({ where: { entity: "PermissionGrant" } });
    expect(audit.map((a) => a.action).sort()).toEqual(["grant.created", "grant.revoked"]);
    expect(audit.every((a) => a.reason)).toBe(true);
  });

  it("expired grants stop working, and can be granted again", async () => {
    const superAdmin = await h.actor("SUPER_ADMIN");
    let admin = await h.actor("ADMIN");
    await h.services.access.grant(superAdmin, { userId: admin.userId, areas: ["RATES_CHARGES"], expiresOn: "2026-03-12", reason: "Budget week" });
    admin = await h.refresh(admin);
    expect(admin.permissions.has(Permission.MANAGE_RATES)).toBe(true);

    h.clock.set("2026-03-13T08:00:00Z");
    admin = await h.refresh(admin);
    expect(admin.permissions.has(Permission.MANAGE_RATES)).toBe(false);

    await h.services.access.grant(superAdmin, { userId: admin.userId, areas: ["RATES_CHARGES"], expiresOn: null, reason: "Again" });
    admin = await h.refresh(admin);
    expect(admin.permissions.has(Permission.MANAGE_RATES)).toBe(true);
  });

  it("the Super Admin has no finance access until they grant it to themselves (audited)", async () => {
    let superAdmin = await h.actor("SUPER_ADMIN");
    expect(superAdmin.permissions.has(Permission.MANAGE_BROUGHT_FORWARD)).toBe(false);
    await h.services.access.grant(superAdmin, { userId: superAdmin.userId, areas: ["BROUGHT_FORWARD"], expiresOn: null, reason: "Year-end close" });
    superAdmin = await h.refresh(superAdmin);
    expect(superAdmin.permissions.has(Permission.MANAGE_BROUGHT_FORWARD)).toBe(true);
    expect(await h.prisma.auditLog.count({ where: { action: "grant.created_self" } })).toBe(1);
  });

  it("only the Super Admin can grant; grants only go to admins", async () => {
    const superAdmin = await h.actor("SUPER_ADMIN");
    const admin = await h.actor("ADMIN");
    const officer = await h.actor("FINANCIAL_OFFICER");
    await expect(
      h.services.access.grant(admin, { userId: admin.userId, areas: ["PAYMENTS"], expiresOn: null, reason: "x x x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      h.services.access.grant(officer, { userId: admin.userId, areas: ["PAYMENTS"], expiresOn: null, reason: "x x x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const member = await h.actor("MEMBER");
    await expect(
      h.services.access.grant(superAdmin, { userId: member.userId, areas: ["PAYMENTS"], expiresOn: null, reason: "x x x" }),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("the last active Super Admin cannot be demoted or deactivated", async () => {
    const superAdmin = await h.actor("SUPER_ADMIN");
    await expect(h.services.access.changeRole(superAdmin, superAdmin.userId, "ADMIN", "testing")).rejects.toBeInstanceOf(RuleError);
    await expect(h.services.access.setActive(superAdmin, superAdmin.userId, false, "testing")).rejects.toBeInstanceOf(RuleError);

    const second = await h.actor("SUPER_ADMIN");
    await h.services.access.changeRole(superAdmin, second.userId, "ADMIN", "handover");
    expect((await h.prisma.user.findUnique({ where: { id: second.userId } }))?.role).toBe("ADMIN");
  });

  it("deactivated users are signed out immediately", async () => {
    const superAdmin = await h.actor("SUPER_ADMIN");
    const officer = await h.actor("FINANCIAL_OFFICER");
    await h.services.access.setActive(superAdmin, officer.userId, false, "left the parish");
    expect(await h.prisma.session.count({ where: { userId: officer.userId } })).toBe(0);
  });
});

describe("first Super Admin (environment bootstrap)", () => {
  it("creates one only while no active Super Admin exists, and they must change the password", async () => {
    expect(await h.services.access.hasActiveSuperAdmin()).toBe(false);
    const input = { name: "Chair", email: "chair@cyon.ng", phone: null, password: "Str0ng-pass!" };
    const user = await h.services.access.bootstrapSuperAdmin(input);
    expect(user.role).toBe("SUPER_ADMIN");
    expect(user.mustChangePassword).toBe(true);
    expect(await h.services.access.hasActiveSuperAdmin()).toBe(true);

    // Last sign-in is recorded only for successful sign-ins.
    const lastLoginAt = async () => (await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt;
    await expect(h.services.auth.login("chair@cyon.ng", "wrong-pass-1")).rejects.toThrow();
    expect(await lastLoginAt()).toBeNull();
    const { token } = await h.services.auth.login("chair@cyon.ng", "Str0ng-pass!");
    expect(await lastLoginAt()).toBeInstanceOf(Date);
    const resolved = await h.services.auth.resolveActor(token);
    expect(resolved?.actor.permissions).toContain(Permission.MANAGE_GRANTS);
    await expect(h.services.access.bootstrapSuperAdmin({ ...input, email: "other@cyon.ng" })).rejects.toThrow(RuleError);
  });
});

describe("member logins (default password from MEMBER_DEFAULT_PASSWORD)", () => {
  const newMember = { fullName: "Ada Obi", phone: "08011112222", email: null, joinedAt: "2026-01-10", createLogin: true };

  it("start with the default password and must change it at first sign-in", async () => {
    const admin = await h.actor("ADMIN");
    const member = await h.services.members.create(admin, newMember);
    expect(member.hasLogin).toBe(true);
    const { user } = await h.services.auth.login("+234 801 111 2222", MEMBER_DEFAULT_PASSWORD);
    expect(user.phone).toBe("08011112222");
    expect(user.mustChangePassword).toBe(true);
  });

  it("expose the default password for sharing only until the member changes it, and can be reset to it", async () => {
    const admin = await h.actor("ADMIN");
    const member = await h.services.members.create(admin, newMember);
    expect(await h.services.members.login(admin, member.id)).toMatchObject({ identifier: "08011112222", defaultPassword: MEMBER_DEFAULT_PASSWORD });

    const { token } = await h.services.auth.login("08011112222", MEMBER_DEFAULT_PASSWORD);
    const { actor } = (await h.services.auth.resolveActor(token))!;
    await h.services.auth.changePassword(actor, MEMBER_DEFAULT_PASSWORD, "My-own-pass-1");
    expect(await h.services.members.login(admin, member.id)).toMatchObject({ defaultPassword: null, mustChangePassword: false });

    await h.services.members.resetLogin(admin, member.id);
    expect(await h.services.members.login(admin, member.id)).toMatchObject({ defaultPassword: MEMBER_DEFAULT_PASSWORD, mustChangePassword: true });
    expect(await h.prisma.session.count({ where: { userId: actor.userId } })).toBe(0);

    const officer = await h.actor("FINANCIAL_OFFICER");
    await expect(h.services.members.login(officer, member.id)).rejects.toThrow(ForbiddenError);
  });

  it("can't be created when no default password is configured", async () => {
    const admin = await h.actor("ADMIN");
    const members = new MemberService({} as UnitOfWork, bcryptHasher, {} as DuesGenerator, null);
    await expect(members.create(admin, newMember)).rejects.toThrow(/MEMBER_DEFAULT_PASSWORD/);
    await expect(members.createLogin(admin, "any")).rejects.toThrow(RuleError);
  });
});
