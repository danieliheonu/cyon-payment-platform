import "server-only";
import { assertCan, assertCanViewMemberRecords, can, type Actor } from "@/domain/actor";
import { ForbiddenError, NotFoundError } from "@/domain/errors";
import { Permission } from "@/domain/permissions";
import type { Clock, FileStorage } from "@/server/ports/file-storage";
import type { DocumentRenderer } from "@/server/ports/receipt-renderer";
import type {
  AllocationRecord,
  AuditRecord,
  PageRequest,
  PageResult,
  PaymentQuery,
  PaymentRecord,
  ReceiptRecord,
  UnitOfWork,
} from "@/server/ports/repositories";
import { sha256Hex } from "@/server/auth/crypto";

export interface PaymentDetail {
  payment: PaymentRecord;
  allocations: AllocationRecord[];
}

/**
 * Read access to payments, receipts and proof files, enforcing the rule that
 * members only ever see their own records.
 */
export class RecordsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly storage: FileStorage,
    private readonly renderer: DocumentRenderer,
    private readonly clock: Clock,
  ) {}

  /** Members are always scoped to their own records, whatever filter they send. */
  scopeQuery(actor: Actor, query: PaymentQuery): PaymentQuery {
    if (can(actor, Permission.VIEW_ALL_PAYMENTS)) return query;
    if (!actor.memberId || !can(actor, Permission.VIEW_OWN_RECORDS)) throw new ForbiddenError();
    return { ...query, memberId: actor.memberId };
  }

  listPayments(actor: Actor, query: PaymentQuery, page: PageRequest): Promise<PageResult<PaymentRecord>> {
    return this.uow.read.payments.list(this.scopeQuery(actor, query), page);
  }

  async getPayment(actor: Actor, paymentId: string): Promise<PaymentDetail> {
    const payment = await this.uow.read.payments.findById(paymentId);
    if (!payment) throw new NotFoundError("Payment");
    assertCanViewMemberRecords(actor, payment.memberId);
    return { payment, allocations: await this.uow.read.allocations.listForPayment(paymentId) };
  }

  async proofFile(actor: Actor, paymentId: string): Promise<{ bytes: Uint8Array; key: string } | null> {
    const { payment } = await this.getPayment(actor, paymentId);
    if (!payment.proofFileKey) return null;
    return { bytes: await this.storage.download(payment.proofFileKey), key: payment.proofFileKey };
  }

  async receiptPdf(actor: Actor, receiptId: string): Promise<{ receipt: ReceiptRecord; pdf: Uint8Array }> {
    const receipt = await this.uow.read.receipts.findById(receiptId);
    if (!receipt) throw new NotFoundError("Receipt");
    const payment = await this.uow.read.payments.findById(receipt.paymentId);
    assertCanViewMemberRecords(actor, payment?.memberId ?? null);
    return { receipt, pdf: await this.renderer.receiptPdf(receipt.snapshot) };
  }

  /** Guest payers (payment links) use the private token from their status link. */
  async guestPayment(token: string): Promise<PaymentRecord | null> {
    return this.uow.read.payments.findByGuestTokenHash(sha256Hex(token));
  }

  async guestReceiptPdf(token: string): Promise<{ receipt: ReceiptRecord; pdf: Uint8Array } | null> {
    const payment = await this.guestPayment(token);
    if (!payment?.receiptId) return null;
    const receipt = await this.uow.read.receipts.findById(payment.receiptId);
    if (!receipt) return null;
    return { receipt, pdf: await this.renderer.receiptPdf(receipt.snapshot) };
  }

  async auditLog(actor: Actor, filter: { entity?: string; entityId?: string }, page: PageRequest): Promise<PageResult<AuditRecord>> {
    assertCan(actor, Permission.VIEW_AUDIT);
    return this.uow.read.audit.list(filter, page);
  }

  now(): Date {
    return this.clock.now();
  }
}
