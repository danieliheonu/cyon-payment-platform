import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, RateLimitedError, ValidationError } from "@/domain/errors";
import { buildServices } from "@/server/container";
import type { UnitOfWork } from "@/server/ports/repositories";
import { PrismaUnitOfWork } from "@/server/infra/prisma/unit-of-work";
import { MemoryStorage, createHarness, key, pngProof } from "../support/harness";

const h = createHarness("2026-03-10T09:00:00Z");
const PASSWORD = "Passw0rd!";

beforeEach(() => h.reset());
afterAll(() => h.prisma.$disconnect());

async function emailOf(userId: string) {
  return (await h.prisma.user.findUniqueOrThrow({ where: { id: userId } })).email!;
}

const later = (minutes: number) => h.clock.set(new Date(h.clock.now().getTime() + minutes * 60_000).toISOString());

describe("sign-in throttling", () => {
  it("locks an account after 5 failed attempts, even with the right password, for 15 minutes", async () => {
    const officer = await h.actor("FINANCIAL_OFFICER");
    const email = await emailOf(officer.userId);
    for (let i = 0; i < 5; i++) await expect(h.services.auth.login(email, "wrong-1")).rejects.toThrow(ValidationError);
    await expect(h.services.auth.login(email, PASSWORD)).rejects.toThrow(RateLimitedError);
    later(16);
    await expect(h.services.auth.login(email, PASSWORD)).resolves.toMatchObject({ user: { id: officer.userId } });
  });

  it("a successful sign-in resets the account's failure count", async () => {
    const admin = await h.actor("ADMIN");
    const email = await emailOf(admin.userId);
    for (let i = 0; i < 4; i++) await expect(h.services.auth.login(email, "wrong-1")).rejects.toThrow(ValidationError);
    await h.services.auth.login(email, PASSWORD);
    for (let i = 0; i < 4; i++) await expect(h.services.auth.login(email, "wrong-1")).rejects.toThrow(ValidationError);
    await expect(h.services.auth.login(email, PASSWORD)).resolves.toBeTruthy();
  });

  it("counts unknown accounts too, and limits one IP across many accounts", async () => {
    for (let i = 0; i < 5; i++) await expect(h.services.auth.login("nobody@cyon.ng", "x")).rejects.toThrow(ValidationError);
    await expect(h.services.auth.login("nobody@cyon.ng", "x")).rejects.toThrow(RateLimitedError);

    for (let i = 0; i < 50; i++) await expect(h.services.auth.login(`guess${i}@cyon.ng`, "x", "203.0.113.9")).rejects.toThrow(ValidationError);
    await expect(h.services.auth.login("fresh@cyon.ng", "x", "203.0.113.9")).rejects.toThrow(RateLimitedError);
    await expect(h.services.auth.login("fresh@cyon.ng", "x", "198.51.100.1")).rejects.toThrow(ValidationError);
  });
});

describe("password change", () => {
  it("signs out every other session and returns a fresh one", async () => {
    const member = await h.actor("MEMBER");
    const email = await emailOf(member.userId);
    const phone = await h.services.auth.login(email, PASSWORD);
    const laptop = await h.services.auth.login(email, PASSWORD);

    const { token } = await h.services.auth.changePassword(member, PASSWORD, "N3w-password");
    expect(await h.services.auth.resolveActor(phone.token)).toBeNull();
    expect(await h.services.auth.resolveActor(laptop.token)).toBeNull();
    expect((await h.services.auth.resolveActor(token))?.actor.userId).toBe(member.userId);
  });

  it("limits wrong current-password guesses", async () => {
    const member = await h.actor("MEMBER");
    for (let i = 0; i < 5; i++) await expect(h.services.auth.changePassword(member, "wrong-1", "N3w-password")).rejects.toThrow(ValidationError);
    await expect(h.services.auth.changePassword(member, PASSWORD, "N3w-password")).rejects.toThrow(RateLimitedError);
  });
});

describe("public payment links", () => {
  it("limits submissions per IP address (every attempt counts)", async () => {
    const guest = { amount: 100000, paidOn: "2026-03-09", senderName: "G", senderBank: "B", idempotencyKey: key(), payerName: "G", payerPhone: "08000000000", payerEmail: null };
    for (let i = 0; i < 30; i++) {
      await expect(h.services.submissions.submitLinkTransfer("no-such-link", guest, pngProof(), "203.0.113.7")).rejects.toThrow(NotFoundError);
    }
    await expect(h.services.submissions.submitLinkTransfer("no-such-link", guest, pngProof(), "203.0.113.7")).rejects.toThrow(RateLimitedError);
  });
});

describe("proof uploads", () => {
  it("removes the uploaded proof when saving the payment fails", async () => {
    const superAdmin = await h.actor("SUPER_ADMIN");
    const officer = await h.actor("FINANCIAL_OFFICER");
    const member = await h.actor("MEMBER");
    const dues = await h.services.categories.create(superAdmin, { name: "Dues", group: "DUES", pricing: "FIXED", startsOn: "2025-01-01", isActive: true });
    await h.services.rates.setRate(officer, { categoryId: dues.id, year: 2026, frequency: "MONTHLY", amount: 50000, note: null, reason: undefined });
    const account = await h.services.bankAccounts.create(officer, { bankName: "B", accountName: "CYON", accountNumber: "3012345678", usage: "GENERAL", isActive: true, sortOrder: 0 });

    const real = new PrismaUnitOfWork(h.prisma, "CYON");
    const failing: UnitOfWork = { read: real.read, run: () => Promise.reject(new Error("database unavailable")) };
    const storage = new MemoryStorage();
    const broken = buildServices({ uow: failing, proofs: storage, backups: storage, clock: h.clock, orgName: "CYON", memberDefaultPassword: null });

    await expect(
      broken.submissions.submitMemberTransfer(
        member,
        { categoryId: dues.id, bankAccountId: account.id, targetObligationId: null, amount: 50000, paidOn: "2026-03-09", senderName: "M", senderBank: "B", idempotencyKey: key() },
        pngProof(),
      ),
    ).rejects.toThrow("database unavailable");
    expect(storage.files.size).toBe(0);
  });
});

describe("housekeeping", () => {
  it("purges expired sessions and old rate-limit counters", async () => {
    const member = await h.actor("MEMBER");
    await expect(h.services.auth.login("nobody@cyon.ng", "x")).rejects.toThrow(ValidationError);
    later(15 * 24 * 60);
    const purged = await h.services.auth.purgeExpired(24 * 60 * 60_000);
    expect(purged.rateLimitHits).toBe(1);
    expect(purged.sessions).toBeGreaterThanOrEqual(1);
    expect(await h.prisma.session.count({ where: { userId: member.userId } })).toBe(0);
  });
});
