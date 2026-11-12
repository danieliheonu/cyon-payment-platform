import "server-only";
import { assertCan, type Actor } from "@/domain/actor";
import { PaymentStatus } from "@/domain/enums";
import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors";
import { Permission } from "@/domain/permissions";
import { toLagosDateOnly } from "@/lib/dates";
import type { CorrectionInput } from "@/lib/validation/schemas";
import type { Clock } from "@/server/ports/file-storage";
import type { PaymentRecord, UnitOfWork } from "@/server/ports/repositories";
import type { PaymentFinalizer } from "./payment-confirmation.service";

/**
 * Corrections never edit a confirmed payment. The original is VOIDED (kept, with
 * the reason) and, if replacing, a new confirmed payment is created that points to
 * it, with a fresh receipt. Before/after values go to the audit log.
 * Finance area: PAYMENTS.
 */
export class CorrectionService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finalizer: PaymentFinalizer,
    private readonly clock: Clock,
  ) {}

  async correct(actor: Actor, input: CorrectionInput): Promise<PaymentRecord | null> {
    assertCan(actor, Permission.CORRECT_PAYMENTS);
    const at = this.clock.now();
    if (input.paidOn && input.paidOn > toLagosDateOnly(at)) {
      throw new ValidationError("The payment date can't be in the future.", { paidOn: "Can't be in the future." });
    }

    return this.uow.run(async (repos) => {
      const original = await repos.payments.findById(input.paymentId);
      if (!original) throw new NotFoundError("Payment");
      if (original.status !== PaymentStatus.CONFIRMED) throw new ConflictError("Only confirmed payments can be corrected.");
      if (!(await repos.payments.markVoided(original.id, { reason: input.reason }))) {
        throw new ConflictError("This payment was changed by someone else. Reload and try again.");
      }

      let replacement: PaymentRecord | null = null;
      if (input.mode === "replace") {
        if (input.categoryId && !(await repos.categories.findById(input.categoryId))) throw new NotFoundError("Category");
        replacement = await repos.payments.create({
          memberId: original.memberId,
          payerName: original.payerName,
          payerPhone: original.payerPhone,
          payerEmail: original.payerEmail,
          paymentLinkId: original.paymentLinkId,
          guestAccessTokenHash: null,
          categoryId: input.categoryId ?? original.categoryId,
          targetObligationId: input.categoryId && input.categoryId !== original.categoryId ? null : original.targetObligationId,
          amountKobo: input.amount ?? original.amountKobo,
          method: original.method,
          status: PaymentStatus.CONFIRMED,
          paidOn: input.paidOn ?? original.paidOn,
          bankAccountId: original.bankAccountId,
          transferReference: original.transferReference,
          senderName: original.senderName,
          senderBank: original.senderBank,
          proofFileKey: original.proofFileKey,
          proofSha256: null, // the original still holds the proof; the replacement shares the file
          idempotencyKey: `correction:${original.id}`,
          recordedById: actor.userId,
          confirmedById: actor.userId,
          confirmedAt: at,
          correctsPaymentId: original.id,
        });
        await this.finalizer.finalize(repos, replacement, { userId: actor.userId, name: actor.displayName }, at, original.receiptNo);
        replacement = await repos.payments.findById(replacement.id);
      }

      await repos.audit.record({
        actorId: actor.userId,
        action: input.mode === "replace" ? "payment.corrected" : "payment.voided",
        entity: "Payment",
        entityId: original.id,
        before: pick(original),
        after: replacement ? { replacementId: replacement.id, ...pick(replacement) } : { status: PaymentStatus.VOIDED },
        reason: input.reason,
      });
      return replacement;
    });
  }
}

function pick(p: PaymentRecord) {
  return {
    amountKobo: p.amountKobo,
    paidOn: p.paidOn,
    category: p.categoryName,
    transferReference: p.transferReference,
    receiptNo: p.receiptNo,
    status: p.status,
  };
}
