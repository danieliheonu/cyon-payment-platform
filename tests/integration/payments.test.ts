import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, RuleError, ValidationError } from "@/domain/errors";
import type { Actor } from "@/domain/actor";
import { createHarness, key, pngProof } from "../support/harness";

const h = createHarness("2026-03-10T09:00:00Z");

beforeEach(() => h.reset());
afterAll(() => h.prisma.$disconnect());

/** Dues ₦500/month for 2026, a member who joined 15 Jan 2026, a general bank account. */
async function setup() {
  const superAdmin = await h.actor("SUPER_ADMIN");
  const officer = await h.actor("FINANCIAL_OFFICER", "Ngozi Officer");
  const member = await h.actor("MEMBER", "Ada Member");
  const dues = await h.services.categories.create(superAdmin, {
    name: "Membership dues",
    group: "DUES",
    pricing: "FIXED",
    startsOn: "2025-01-01",
    isActive: true,
  });
  await h.services.rates.setRate(officer, { categoryId: dues.id, year: 2026, frequency: "MONTHLY", amount: 50000, note: null, reason: undefined });
  const account = await h.services.bankAccounts.create(officer, {
    bankName: "First Bank",
    accountName: "CYON St Mary",
    accountNumber: "3012345678",
    usage: "GENERAL",
    isActive: true,
    sortOrder: 0,
  });
  return { superAdmin, officer, member, dues, account };
}

function transfer(account: { id: string }, categoryId: string, amount: number) {
  return {
    categoryId,
    bankAccountId: account.id,
    targetObligationId: null,
    amount,
    paidOn: "2026-03-09",
    senderName: "Ada Member",
    senderBank: "GTBank",
    idempotencyKey: key(),
  };
}

async function balance(member: Actor) {
  return h.services.obligations.totalBalance({ memberId: member.memberId! });
}

describe("member pays by transfer → officer confirms → receipt", () => {
  it("generates monthly dues from the join date to today", async () => {
    const { member } = await setup();
    const obligations = await h.services.obligations.forMember(member.memberId!);
    expect(obligations.map((o) => o.periodKey)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect((await balance(member)).outstandingKobo).toBe(150000);
  });

  it("stays pending (not counted) until confirmed, then allocates oldest-first and issues a receipt", async () => {
    const { officer, member, dues, account } = await setup();
    const payment = await h.services.submissions.submitMemberTransfer(member, transfer(account, dues.id, 80000), pngProof());
    expect(payment.status).toBe("PENDING");

    let summary = await h.services.reports.summary(officer, {});
    expect(summary.confirmedTotalKobo).toBe(0);
    expect(summary.pendingCount).toBe(1);
    expect((await balance(member)).outstandingKobo).toBe(150000);

    const receipt = await h.services.confirmations.confirm(officer, payment.id);
    expect(receipt.receiptNo).toBe("CYON-2026-000001");
    expect(receipt.snapshot).toMatchObject({
      orgName: "CYON",
      payerName: "Ada Member",
      purpose: "Membership dues",
      amountKobo: 80000,
      paidOn: "2026-03-09",
      coverage: ["January 2026", "February 2026"],
      confirmedByName: "Ngozi Officer",
    });

    summary = await h.services.reports.summary(officer, {});
    expect(summary.confirmedTotalKobo).toBe(80000);
    expect(summary.byCategory).toEqual([expect.objectContaining({ categoryName: "Membership dues", totalKobo: 80000 })]);
    expect((await balance(member)).outstandingKobo).toBe(70000);

    const { pdf } = await h.services.records.receiptPdf(member, receipt.id);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("rejects duplicates: same submission, same proof", async () => {
    const { member, dues, account } = await setup();
    const input = transfer(account, dues.id, 10000);
    const proof = pngProof("same-file");
    await h.services.submissions.submitMemberTransfer(member, input, proof);

    await expect(h.services.submissions.submitMemberTransfer(member, input, pngProof())).rejects.toThrow(ConflictError);
    await expect(
      h.services.submissions.submitMemberTransfer(member, { ...transfer(account, dues.id, 10000) }, proof),
    ).rejects.toThrow(/proof/);
  });

  it("requires proof and blocks paying more than is owed", async () => {
    const { member, dues, account } = await setup();
    await expect(h.services.submissions.submitMemberTransfer(member, transfer(account, dues.id, 10000), null)).rejects.toThrow(ValidationError);
    await expect(
      h.services.submissions.submitMemberTransfer(member, transfer(account, dues.id, 150001), pngProof()),
    ).rejects.toMatchObject({ fieldErrors: { amount: expect.stringMatching(/outstanding balance/) } });
  });

  it("confirmation is atomic: an over-allocating payment stays pending with no receipt", async () => {
    const { officer, member, dues, account } = await setup();
    const first = await h.services.submissions.submitMemberTransfer(member, transfer(account, dues.id, 100000), pngProof());
    const second = await h.services.submissions.submitMemberTransfer(member, transfer(account, dues.id, 100000), pngProof());
    await h.services.confirmations.confirm(officer, first.id);
    await expect(h.services.confirmations.confirm(officer, second.id)).rejects.toThrow(RuleError);

    const after = await h.prisma.payment.findUnique({ where: { id: second.id }, include: { receipt: true, allocations: true } });
    expect(after?.status).toBe("PENDING");
    expect(after?.receipt).toBeNull();
    expect(after?.allocations).toHaveLength(0);
    await expect(h.services.confirmations.confirm(officer, first.id)).rejects.toThrow(ConflictError);
  });

  it("members only see their own records", async () => {
    const { member, dues, account } = await setup();
    const other = await h.actor("MEMBER", "Other Member");
    const payment = await h.services.submissions.submitMemberTransfer(member, transfer(account, dues.id, 10000), pngProof());
    await expect(h.services.records.getPayment(other, payment.id)).rejects.toThrow(ForbiddenError);
    await expect(h.services.records.proofFile(other, payment.id)).rejects.toThrow(ForbiddenError);
    expect((await h.services.records.proofFile(member, payment.id))?.bytes.length).toBeGreaterThan(0);
    const list = await h.services.records.listPayments(other, { memberId: member.memberId! }, { page: 1, pageSize: 10 });
    expect(list.total).toBe(0);
  });

  it("officer records cash: confirmed immediately with a receipt; members cannot", async () => {
    const { officer, member, dues } = await setup();
    const cash = { memberId: member.memberId!, payerName: null, categoryId: dues.id, targetObligationId: null, amount: 50000, paidOn: "2026-03-10", note: null, idempotencyKey: key() };
    const { payment, receipt } = await h.services.submissions.recordCash(officer, cash);
    expect(payment.status).toBe("CONFIRMED");
    expect(receipt.snapshot.method).toBe("CASH");
    expect((await balance(member)).outstandingKobo).toBe(100000);
    await expect(h.services.submissions.recordCash(member, { ...cash, idempotencyKey: key() })).rejects.toThrow(ForbiddenError);
  });

  it("corrections void the original, keep it, issue a new receipt and audit both values", async () => {
    const { officer, member, dues, account } = await setup();
    const payment = await h.services.submissions.submitMemberTransfer(member, transfer(account, dues.id, 50000), pngProof());
    const receipt = await h.services.confirmations.confirm(officer, payment.id);

    const replacement = await h.services.corrections.correct(officer, {
      paymentId: payment.id,
      mode: "replace",
      amount: 100000,
      paidOn: null,
      categoryId: null,
      reason: "Bank statement shows ₦1,000",
    });
    const original = await h.prisma.payment.findUnique({ where: { id: payment.id } });
    expect(original?.status).toBe("VOIDED");
    expect(original?.voidReason).toBe("Bank statement shows ₦1,000");
    expect(replacement?.correctsPaymentId).toBe(payment.id);
    expect(replacement?.receiptNo).not.toBe(receipt.receiptNo);
    expect((await balance(member)).outstandingKobo).toBe(50000);
    expect((await h.services.reports.summary(officer, {})).confirmedTotalKobo).toBe(100000);

    const audit = await h.prisma.auditLog.findFirst({ where: { action: "payment.corrected" } });
    expect(audit?.before).toMatchObject({ amountKobo: 50000 });
    expect(audit?.after).toMatchObject({ amountKobo: 100000 });
  });

  it("rejected payments never count", async () => {
    const { officer, member, dues, account } = await setup();
    const payment = await h.services.submissions.submitMemberTransfer(member, transfer(account, dues.id, 50000), pngProof());
    await h.services.confirmations.reject(officer, payment.id, "No such credit on statement");
    expect((await h.services.reports.summary(officer, {})).confirmedTotalKobo).toBe(0);
    expect((await balance(member)).outstandingKobo).toBe(150000);
  });
});
