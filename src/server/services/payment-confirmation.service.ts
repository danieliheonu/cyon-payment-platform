import "server-only";
import { assertCan, type Actor } from "@/domain/actor";
import { allocatePayment, type Allocation } from "@/domain/allocation";
import { LABELS, Pricing } from "@/domain/enums";
import { ConflictError, NotFoundError } from "@/domain/errors";
import { Permission } from "@/domain/permissions";
import { toLagosDateOnly, yearOf } from "@/lib/dates";
import type { Clock } from "@/server/ports/file-storage";
import type {
  MemberRecord,
  PaymentRecord,
  ReceiptRecord,
  ReceiptSnapshot,
  Repositories,
  UnitOfWork,
} from "@/server/ports/repositories";

/**
 * Turns a payment into money that counts: allocation to what the member owes,
 * receipt number and receipt snapshot. Used by confirmation, cash recording and
 * corrections so the steps exist in one place.
 */
export class PaymentFinalizer {
  constructor(private readonly orgName: string) {}

  async finalize(
    repos: Repositories,
    payment: PaymentRecord,
    confirmedBy: { userId: string; name: string },
    at: Date,
    replacesReceiptNo: string | null = null,
  ): Promise<ReceiptRecord> {
    const allocations = await this.allocate(repos, payment);
    const coverage = allocations.length
      ? (await repos.allocations.listForPayment(payment.id)).map((a) => a.label.split(" — ").at(-1) ?? a.label)
      : [];
    const receiptNo = await repos.receiptNumbers.next(yearOf(toLagosDateOnly(at)));
    const snapshot: ReceiptSnapshot = {
      orgName: this.orgName,
      receiptNo,
      payerName: payment.memberName ?? payment.payerName,
      memberNo: payment.memberNo,
      purpose: payment.paymentLinkPurpose ?? payment.categoryName,
      categoryName: payment.categoryName,
      coverage,
      amountKobo: payment.amountKobo,
      paidOn: payment.paidOn,
      method: payment.method,
      confirmedAt: at.toISOString(),
      confirmedByName: confirmedBy.name,
      replacesReceiptNo,
    };
    return repos.receipts.create({ receiptNo, paymentId: payment.id, snapshot });
  }

  private async allocate(repos: Repositories, payment: PaymentRecord): Promise<Allocation[]> {
    if (!payment.memberId || payment.paymentLinkId) return [];
    const category = await repos.categories.findById(payment.categoryId);
    if (!category || category.pricing !== Pricing.FIXED) return [];
    const obligations = await repos.obligations.lockForAllocation(payment.memberId, payment.categoryId);
    const allocations = allocatePayment(
      payment.amountKobo,
      obligations.map((o) => ({ id: o.id, amountKobo: o.amountKobo, allocatedKobo: o.allocatedKobo, sortKey: `${o.periodKey}|${o.createdAt.toISOString()}` })),
      payment.targetObligationId,
    );
    await repos.allocations.createMany(payment.id, allocations);
    return allocations;
  }
}

/** Finance staff confirm or reject pending payments. Finance area: PAYMENTS. */
export class PaymentConfirmationService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finalizer: PaymentFinalizer,
    private readonly clock: Clock,
  ) {}

  /** Members whose phone/email match a guest payer — shown as a suggestion when confirming. */
  async suggestMembers(payment: PaymentRecord): Promise<MemberRecord[]> {
    if (payment.memberId) return [];
    return this.uow.read.members.findMatching({ phone: payment.payerPhone, email: payment.payerEmail });
  }

  async confirm(actor: Actor, paymentId: string, options: { linkMemberId?: string | null } = {}): Promise<ReceiptRecord> {
    assertCan(actor, Permission.CONFIRM_PAYMENTS);
    const at = this.clock.now();
    return this.uow.run(async (repos) => {
      const before = await repos.payments.findById(paymentId);
      if (!before) throw new NotFoundError("Payment");
      if (options.linkMemberId && !before.memberId && !(await repos.members.findById(options.linkMemberId))) {
        throw new NotFoundError("Member");
      }
      const linkMemberId = !before.memberId && options.linkMemberId ? options.linkMemberId : undefined;
      if (!(await repos.payments.markConfirmed(paymentId, { confirmedById: actor.userId, at, linkMemberId }))) {
        throw new ConflictError(`This payment is already ${LABELS.paymentStatus[before.status].toLowerCase()}.`);
      }
      const payment = (await repos.payments.findById(paymentId))!;
      const receipt = await this.finalizer.finalize(repos, payment, { userId: actor.userId, name: actor.displayName }, at);
      await repos.audit.record({
        actorId: actor.userId,
        action: "payment.confirmed",
        entity: "Payment",
        entityId: paymentId,
        before: { status: before.status, memberId: before.memberId },
        after: { status: "CONFIRMED", memberId: payment.memberId, receiptNo: receipt.receiptNo },
      });
      return receipt;
    });
  }

  async reject(actor: Actor, paymentId: string, reason: string): Promise<void> {
    assertCan(actor, Permission.CONFIRM_PAYMENTS);
    await this.uow.run(async (repos) => {
      const before = await repos.payments.findById(paymentId);
      if (!before) throw new NotFoundError("Payment");
      if (!(await repos.payments.markRejected(paymentId, { confirmedById: actor.userId, at: this.clock.now(), reason }))) {
        throw new ConflictError(`This payment is already ${LABELS.paymentStatus[before.status].toLowerCase()}.`);
      }
      await repos.audit.record({
        actorId: actor.userId,
        action: "payment.rejected",
        entity: "Payment",
        entityId: paymentId,
        before: { status: before.status },
        after: { status: "REJECTED" },
        reason,
      });
    });
  }
}
