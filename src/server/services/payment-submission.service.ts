import "server-only";
import { assertCan, type Actor } from "@/domain/actor";
import { outstandingKobo } from "@/domain/balance";
import { BankAccountUsage, PaymentMethod, PaymentStatus, Pricing } from "@/domain/enums";
import { ConflictError, NotFoundError, RuleError, ValidationError } from "@/domain/errors";
import { formatNaira, sumKobo } from "@/domain/money";
import { assertAmountAllowed, assertLinkOpen } from "@/domain/payment-link";
import { Permission } from "@/domain/permissions";
import { toLagosDateOnly, yearOf, type DateOnly } from "@/lib/dates";
import type { CashInput, GuestTransferInput, MemberTransferInput } from "@/lib/validation/schemas";
import type { Clock, FileStorage } from "@/server/ports/file-storage";
import type { DuplicateProbe, NewPayment, PaymentRecord, ReceiptRecord, UnitOfWork } from "@/server/ports/repositories";
import { randomToken, sha256Hex } from "@/server/auth/crypto";
import type { Channel, MethodDecision, PaymentMethodRegistry } from "@/server/payment-methods/handlers";
import type { PaymentFinalizer } from "./payment-confirmation.service";
import { inspectProof, proofStorageKey, type InspectedProof, type UploadedFile } from "./proof";
import { RATE_LIMITS, type RateLimiter } from "./rate-limiter";

const DUPLICATE_MESSAGES: Record<keyof DuplicateProbe, string> = {
  idempotencyKey: "This payment was already submitted.",
  proofSha256: "This proof of payment has already been used for another payment.",
};

/**
 * Creates payments for all three channels — member transfer, public payment link
 * and finance-staff cash — through one path (`create`), with method rules
 * supplied by the PaymentMethodRegistry.
 */
export class PaymentSubmissionService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly storage: FileStorage,
    private readonly methods: PaymentMethodRegistry,
    private readonly finalizer: PaymentFinalizer,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  /** A signed-in member reports a bank transfer. */
  async submitMemberTransfer(actor: Actor, input: MemberTransferInput, proofFile: UploadedFile | null): Promise<PaymentRecord> {
    assertCan(actor, Permission.PAY_OWN);
    if (!actor.memberId) throw new RuleError("Your account is not linked to a member record.");
    const member = await this.uow.read.members.findById(actor.memberId);
    if (!member) throw new NotFoundError("Member");

    const account = await this.uow.read.bankAccounts.findById(input.bankAccountId);
    if (!account || !account.isActive || account.usage !== BankAccountUsage.GENERAL) {
      throw new ValidationError("Choose one of the listed accounts.", { bankAccountId: "Choose one of the listed accounts." });
    }
    await this.assertWithinOutstanding(member.id, input.categoryId, input.amount, input.targetObligationId);

    const proof = inspectProof(proofFile);
    const { payment } = await this.create(
      {
        memberId: member.id,
        payerName: member.fullName,
        payerPhone: member.phone,
        payerEmail: member.email,
        paymentLinkId: null,
        categoryId: input.categoryId,
        targetObligationId: input.targetObligationId,
        amountKobo: input.amount,
        method: PaymentMethod.BANK_TRANSFER,
        paidOn: input.paidOn,
        bankAccountId: account.id,
        transferReference: null,
        senderName: input.senderName,
        senderBank: input.senderBank,
        idempotencyKey: input.idempotencyKey,
      },
      { channel: "MEMBER", actor, proof },
    );
    return payment;
  }

  /** Anyone pays through a public payment link. Returns the private status token (shown once). */
  async submitLinkTransfer(
    slug: string,
    input: GuestTransferInput,
    proofFile: UploadedFile | null,
    clientIp: string | null = null,
  ): Promise<{ payment: PaymentRecord; statusToken: string }> {
    // No login on this path: every attempt counts toward the per-IP limit.
    if (clientIp) {
      const rule = RATE_LIMITS.linkSubmitPerIp(clientIp);
      await this.limiter.check([rule], "Too many submissions from your network. Please wait a while and try again.");
      await this.limiter.hit([rule]);
    }
    const link = await this.uow.read.paymentLinks.findBySlug(slug);
    if (!link) throw new NotFoundError("Payment link");
    assertLinkOpen(link, this.clock.now(), link.confirmedTotalKobo);
    assertAmountAllowed(link, input.amount);

    const proof = inspectProof(proofFile);
    const statusToken = randomToken(24);
    const { payment } = await this.create(
      {
        memberId: null,
        payerName: input.payerName,
        payerPhone: input.payerPhone,
        payerEmail: input.payerEmail,
        paymentLinkId: link.id,
        guestAccessTokenHash: sha256Hex(statusToken),
        categoryId: link.categoryId,
        targetObligationId: null,
        amountKobo: input.amount,
        method: PaymentMethod.BANK_TRANSFER,
        paidOn: input.paidOn,
        bankAccountId: link.bankAccount.id,
        transferReference: null,
        senderName: input.senderName,
        senderBank: input.senderBank,
        idempotencyKey: input.idempotencyKey,
      },
      { channel: "LINK", actor: null, proof },
    );
    return { payment, statusToken };
  }

  /** Finance staff record cash received; it is confirmed and receipted immediately. */
  async recordCash(actor: Actor, input: CashInput): Promise<{ payment: PaymentRecord; receipt: ReceiptRecord }> {
    assertCan(actor, Permission.RECORD_CASH);
    const member = input.memberId ? await this.uow.read.members.findById(input.memberId) : null;
    if (input.memberId && !member) throw new NotFoundError("Member");
    if (member) await this.assertWithinOutstanding(member.id, input.categoryId, input.amount, input.targetObligationId);

    const result = await this.create(
      {
        memberId: member?.id ?? null,
        payerName: member?.fullName ?? input.payerName ?? "",
        payerPhone: member?.phone ?? null,
        payerEmail: member?.email ?? null,
        paymentLinkId: null,
        categoryId: input.categoryId,
        targetObligationId: input.targetObligationId,
        amountKobo: input.amount,
        method: PaymentMethod.CASH,
        paidOn: input.paidOn,
        bankAccountId: null,
        transferReference: input.note, // cash note (shown as "Note")
        senderName: null,
        senderBank: null,
        idempotencyKey: input.idempotencyKey,
      },
      { channel: "STAFF", actor, proof: null },
    );
    return { payment: result.payment, receipt: result.receipt! };
  }

  // ───────────── shared path ─────────────

  private async create(
    draft: Omit<NewPayment, "status" | "proofFileKey" | "proofSha256" | "recordedById" | "confirmedById" | "confirmedAt" | "correctsPaymentId" | "guestAccessTokenHash"> & {
      guestAccessTokenHash?: string;
    },
    context: { channel: Channel; actor: Actor | null; proof: InspectedProof | null },
  ): Promise<{ payment: PaymentRecord; receipt: ReceiptRecord | null }> {
    const { channel, actor, proof } = context;
    this.assertPaidOnNotFuture(draft.paidOn);
    const decision = this.methods.get(draft.method).decide(
      { bankAccountId: draft.bankAccountId, hasProof: proof !== null },
      channel,
      actor,
    );

    const category = await this.uow.read.categories.findById(draft.categoryId);
    if (!category || !category.isActive) throw new ValidationError("Choose a payment category.", { categoryId: "Choose a payment category." });

    const probe: DuplicateProbe = {
      idempotencyKey: draft.idempotencyKey,
      proofSha256: proof?.sha256 ?? null,
    };
    const duplicate = await this.uow.read.payments.findDuplicate(probe);
    if (duplicate) throw new ConflictError(DUPLICATE_MESSAGES[duplicate.field]);

    // Upload before the transaction (a payment must never point at a missing file);
    // if the transaction then fails, the upload is removed so no orphan is left behind.
    const now = this.clock.now();
    const proofFileKey = proof ? proofStorageKey(proof, yearOf(toLagosDateOnly(now))) : null;
    if (proof && proofFileKey) await this.storage.upload(proofFileKey, proof.bytes, proof.contentType);

    try {
      return await this.saveSubmission(draft, { ...context, now, decision, proofFileKey });
    } catch (error) {
      if (proofFileKey) await this.storage.delete(proofFileKey).catch((e) => console.error("Could not remove orphaned proof", proofFileKey, e));
      throw error;
    }
  }

  private saveSubmission(
    draft: Parameters<PaymentSubmissionService["create"]>[0],
    context: { channel: Channel; actor: Actor | null; proof: InspectedProof | null; now: Date; decision: MethodDecision; proofFileKey: string | null },
  ): Promise<{ payment: PaymentRecord; receipt: ReceiptRecord | null }> {
    const { channel, actor, proof, now, decision, proofFileKey } = context;
    return this.uow.run(async (repos) => {
      const payment = await repos.payments.create({
        ...draft,
        guestAccessTokenHash: draft.guestAccessTokenHash ?? null,
        status: decision.initialStatus,
        proofFileKey,
        proofSha256: proof?.sha256 ?? null,
        recordedById: actor?.userId ?? null,
        confirmedById: decision.confirmsOnCreate ? actor?.userId ?? null : null,
        confirmedAt: decision.confirmsOnCreate ? now : null,
        correctsPaymentId: null,
      });
      const receipt =
        decision.confirmsOnCreate && actor
          ? await this.finalizer.finalize(repos, payment, { userId: actor.userId, name: actor.displayName }, now)
          : null;
      await repos.audit.record({
        actorId: actor?.userId ?? null,
        action: decision.confirmsOnCreate ? "payment.recorded_confirmed" : "payment.submitted",
        entity: "Payment",
        entityId: payment.id,
        after: {
          channel,
          method: payment.method,
          amountKobo: payment.amountKobo,
          category: payment.categoryName,
          payer: payment.payerName,
          status: payment.status,
          receiptNo: receipt?.receiptNo ?? null,
        },
      });
      return { payment, receipt };
    });
  }

  /** FIXED categories: cannot pay more than the member's outstanding balance (part payment allowed). */
  private async assertWithinOutstanding(memberId: string, categoryId: string, amountKobo: number, targetObligationId: string | null) {
    const category = await this.uow.read.categories.findById(categoryId);
    if (!category || category.pricing !== Pricing.FIXED) {
      if (targetObligationId) throw new ValidationError("This category has no periods to choose.");
      return;
    }
    const obligations = await this.uow.read.obligations.listWithAllocations({ memberId, categoryId });
    if (targetObligationId && !obligations.some((o) => o.id === targetObligationId)) {
      throw new ValidationError("Choose one of your own charges.", { targetObligationId: "Choose one of your own charges." });
    }
    const outstanding = sumKobo(obligations.map(outstandingKobo));
    if (outstanding === 0) throw new RuleError(`Nothing is outstanding for ${category.name}.`);
    if (amountKobo > outstanding) {
      throw new ValidationError("Amount is more than what is owed.", {
        amount: `The outstanding balance for ${category.name} is ${formatNaira(outstanding)}.`,
      });
    }
  }

  private assertPaidOnNotFuture(paidOn: DateOnly) {
    if (paidOn > toLagosDateOnly(this.clock.now())) {
      throw new ValidationError("The payment date can't be in the future.", { paidOn: "The payment date can't be in the future." });
    }
  }
}

export { PaymentStatus };
