import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, RuleError, ValidationError } from "@/domain/errors";
import { createHarness, key, pngProof } from "../support/harness";

const h = createHarness("2026-03-10T09:00:00Z");

beforeEach(() => h.reset());
afterAll(() => h.prisma.$disconnect());

async function setup() {
  const superAdmin = await h.actor("SUPER_ADMIN");
  const officer = await h.actor("FINANCIAL_OFFICER");
  const member = await h.actor("MEMBER", "Chidi Member");
  const dues = await h.services.categories.create(superAdmin, { name: "Dues", group: "DUES", pricing: "FIXED", startsOn: "2025-01-01", isActive: true });
  return { superAdmin, officer, member, dues };
}

describe("yearly rates and frequency", () => {
  it("rate changes re-price only completely unpaid automatic dues, with a reason", async () => {
    const { officer, member, dues } = await setup();
    await h.services.rates.setRate(officer, { categoryId: dues.id, year: 2026, frequency: "MONTHLY", amount: 50000, note: null, reason: undefined });
    await h.services.submissions.recordCash(officer, {
      memberId: member.memberId!, payerName: null, categoryId: dues.id, targetObligationId: null,
      amount: 20000, paidOn: "2026-03-01", note: null, idempotencyKey: key(),
    });

    await expect(
      h.services.rates.setRate(officer, { categoryId: dues.id, year: 2026, frequency: "MONTHLY", amount: 60000, note: null, reason: undefined }),
    ).rejects.toThrow(ValidationError);

    const { repriced } = await h.services.rates.setRate(officer, {
      categoryId: dues.id, year: 2026, frequency: "MONTHLY", amount: 60000, note: null, reason: "AGM approved increase",
    });
    expect(repriced).toBe(2); // Feb, Mar; Jan is part-paid
    const amounts = (await h.services.obligations.forMember(member.memberId!)).map((o) => [o.periodKey, o.amountKobo]);
    expect(amounts).toEqual([["2026-01", 50000], ["2026-02", 60000], ["2026-03", 60000]]);
  });

  it("frequency can't change within a year once dues exist, but can change next year", async () => {
    const { officer, member, dues } = await setup();
    await h.services.rates.setRate(officer, { categoryId: dues.id, year: 2026, frequency: "MONTHLY", amount: 50000, note: null, reason: undefined });
    await expect(
      h.services.rates.setRate(officer, { categoryId: dues.id, year: 2026, frequency: "YEARLY", amount: 600000, note: null, reason: "switch" }),
    ).rejects.toThrow(RuleError);

    await h.services.rates.setRate(officer, { categoryId: dues.id, year: 2027, frequency: "QUARTERLY", amount: 150000, note: null, reason: undefined });
    h.clock.set("2027-05-02T09:00:00Z");
    await h.services.obligations.generateDue();
    const keys = (await h.services.obligations.forMember(member.memberId!)).map((o) => o.periodKey);
    expect(keys.filter((k) => k.startsWith("2026"))).toHaveLength(12);
    expect(keys.filter((k) => k.startsWith("2027"))).toEqual(["2027-Q1", "2027-Q2"]);
  });

  it("one-time levies are applied by finance staff using the year's rate", async () => {
    const { superAdmin, officer, member } = await setup();
    const levy = await h.services.categories.create(superAdmin, { name: "Building levy", group: "LEVY", pricing: "FIXED", startsOn: "2026-01-01", isActive: true });
    await h.services.rates.setRate(officer, { categoryId: levy.id, year: 2026, frequency: "ONE_OFF", amount: 500000, note: null, reason: undefined });
    expect(await h.services.obligations.forMember(member.memberId!, { categoryId: levy.id })).toHaveLength(0);

    const created = await h.services.obligations.applyCharge(officer, { categoryId: levy.id, year: 2026, name: null, memberIds: [], allMembers: true, amount: null });
    expect(created).toBe(1);
    const [charge] = await h.services.obligations.forMember(member.memberId!, { categoryId: levy.id });
    expect(charge).toMatchObject({ periodKey: "2026", amountKobo: 500000, source: "MANUAL" });
    await expect(
      h.services.obligations.applyCharge(superAdmin, { categoryId: levy.id, year: 2026, name: null, memberIds: [], allMembers: true, amount: null }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("brought forward and the yearly summary", () => {
  it("total funds = brought forward + confirmed receipts; edits need a reason and are audited", async () => {
    const { officer, member, dues } = await setup();
    await h.services.rates.setRate(officer, { categoryId: dues.id, year: 2026, frequency: "MONTHLY", amount: 50000, note: null, reason: undefined });
    await h.services.financialYears.setBroughtForward(officer, { year: 2026, amount: 2_500_000, note: "Per 2025 accounts", reason: undefined });
    await expect(
      h.services.financialYears.setBroughtForward(officer, { year: 2026, amount: 2_600_000, note: null, reason: undefined }),
    ).rejects.toThrow(ValidationError);
    await h.services.financialYears.setBroughtForward(officer, { year: 2026, amount: 2_600_000, note: null, reason: "Auditor adjustment" });

    await h.services.submissions.recordCash(officer, {
      memberId: member.memberId!, payerName: null, categoryId: dues.id, targetObligationId: null,
      amount: 100000, paidOn: "2026-03-01", note: null, idempotencyKey: key(),
    });
    const { summary } = await h.services.reports.yearSummary(officer, 2026);
    expect(summary).toMatchObject({ broughtForwardKobo: 2_600_000, totalReceiptsKobo: 100000, totalFundsKobo: 2_700_000, outstandingKobo: 50000 });

    const audit = await h.prisma.auditLog.findFirst({ where: { action: "brought_forward.updated" } });
    expect(audit).toMatchObject({ reason: "Auditor adjustment", before: { broughtForwardKobo: 2_500_000 } });
    expect(await h.services.reports.yearSummaryCsv(officer, 2026)).toContain("27000.00");
  });

  it("members can't see the yearly summary", async () => {
    const { member } = await setup();
    await expect(h.services.reports.yearSummary(member, 2026)).rejects.toThrow(ForbiddenError);
  });
});

describe("payment links", () => {
  async function linkSetup() {
    const base = await setup();
    const fundraising = await h.services.categories.create(base.superAdmin, {
      name: "Harvest fundraising", group: "EVENT", pricing: "OPEN", startsOn: "2026-01-01", isActive: true,
    });
    let admin = await h.actor("ADMIN", "Admin With Grant");
    await h.services.access.grant(base.superAdmin, { userId: admin.userId, areas: ["LINKS_ACCOUNTS"], expiresOn: null, reason: "Harvest committee" });
    admin = await h.refresh(admin);
    const link = await h.services.paymentLinks.create(admin, {
      title: "Harvest 2026",
      purpose: "Contribution to the 2026 harvest thanksgiving",
      categoryId: fundraising.id,
      bankAccountId: null,
      newBankName: "Zenith Bank",
      newAccountName: "CYON Harvest Committee",
      newAccountNumber: "1012345678",
      amountMode: "MINIMUM",
      amount: 100000,
      target: 300000,
      closesOn: null,
      autoCloseOnTarget: true,
    });
    return { ...base, admin, link };
  }

  function guest(amount: number, extra: Partial<Record<string, string | null>> = {}) {
    return {
      payerName: "Mrs Okafor",
      payerPhone: "08031234567",
      payerEmail: null,
      amount,
      paidOn: "2026-03-09",
      senderName: "Okafor N",
      senderBank: "Access",
      idempotencyKey: key(),
      ...extra,
    };
  }

  it("guest pays via link, officer confirms, guest downloads receipt with the link purpose", async () => {
    const { officer, link } = await linkSetup();
    expect((await h.services.bankAccounts.list({ usage: "GENERAL" })).map((a) => a.accountNumber)).not.toContain("1012345678");

    const { payment, statusToken } = await h.services.submissions.submitLinkTransfer(link.slug, guest(150000), pngProof());
    expect(payment.status).toBe("PENDING");
    expect(payment.bankAccountId).toBe(link.bankAccount.id);

    await h.services.confirmations.confirm(officer, payment.id);
    const guestReceipt = await h.services.records.guestReceiptPdf(statusToken);
    expect(guestReceipt?.receipt.snapshot.purpose).toBe("Contribution to the 2026 harvest thanksgiving");
    expect(await h.services.records.guestPayment("wrong-token")).toBeNull();

    const view = await h.services.paymentLinks.publicView(link.slug);
    expect(view?.confirmedTotalKobo).toBe(150000);
    expect(view?.availability.open).toBe(true);
  });

  it("enforces the minimum and closes automatically at the target", async () => {
    const { officer, link } = await linkSetup();
    await expect(h.services.submissions.submitLinkTransfer(link.slug, guest(50000), pngProof())).rejects.toThrow(/minimum/i);
    const { payment } = await h.services.submissions.submitLinkTransfer(link.slug, guest(300000), pngProof());
    await h.services.confirmations.confirm(officer, payment.id);
    expect((await h.services.paymentLinks.publicView(link.slug))?.availability).toMatchObject({ open: false, reason: "TARGET_REACHED" });
    await expect(h.services.submissions.submitLinkTransfer(link.slug, guest(100000), pngProof())).rejects.toThrow(RuleError);
  });

  it("officer can link a guest payer to a matching member when confirming", async () => {
    const { officer, member, link } = await linkSetup();
    const memberPhone = (await h.prisma.member.findUnique({ where: { id: member.memberId! } }))!.phone;
    const { payment } = await h.services.submissions.submitLinkTransfer(link.slug, guest(100000, { payerPhone: memberPhone }), pngProof());
    const suggestions = await h.services.confirmations.suggestMembers(payment);
    expect(suggestions.map((m) => m.id)).toEqual([member.memberId]);
    await h.services.confirmations.confirm(officer, payment.id, { linkMemberId: member.memberId });
    const history = await h.services.records.listPayments(member, {}, { page: 1, pageSize: 10 });
    expect(history.rows.map((p) => p.id)).toContain(payment.id);
  });

  it("a closed link rejects submissions; an Admin without the grant can't create links", async () => {
    const { superAdmin, admin, link } = await linkSetup();
    await h.services.paymentLinks.setStatus(admin, link.id, "CLOSED");
    await expect(h.services.submissions.submitLinkTransfer(link.slug, guest(100000), pngProof())).rejects.toThrow(/closed/);
    await expect(
      h.services.paymentLinks.setStatus(superAdmin, link.id, "OPEN"),
    ).rejects.toThrow(ForbiddenError);
  });
});
