import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ObligationSource, PaymentMethod, PaymentStatus } from "@/domain/enums";
import { ConflictError } from "@/domain/errors";
import type {
  AllocationRecord,
  AllocationRepository,
  DuplicateProbe,
  NewObligation,
  NewPayment,
  ObligationFilter,
  ObligationRecord,
  ObligationRepository,
  PageRequest,
  PaymentQuery,
  PaymentRecord,
  PaymentRepository,
  ReceiptNumberGenerator,
  ReceiptRecord,
  ReceiptRepository,
  ReceiptSnapshot,
} from "@/server/ports/repositories";
import type { CategoryReceipts } from "@/domain/year-summary";
import { big, fromDb, isUniqueViolation, json, kobo, pageResult, paging, toDb, toDbOrUndefined, type Db } from "./db";

// ───────────── Obligations ─────────────

type ObligationSqlRow = {
  id: string;
  memberId: string;
  categoryId: string;
  categoryName: string;
  periodKey: string;
  label: string;
  amountKobo: bigint;
  source: ObligationSource;
  createdAt: Date;
  allocatedKobo: bigint;
};

function toObligation(row: ObligationSqlRow): ObligationRecord {
  return { ...row, amountKobo: kobo(row.amountKobo), allocatedKobo: kobo(row.allocatedKobo) };
}

function yearCondition(year: number): Prisma.Sql {
  return Prisma.sql`(o."periodKey" = ${String(year)} OR o."periodKey" LIKE ${`${year}-%`})`;
}

export class PrismaObligationRepository implements ObligationRepository {
  constructor(private readonly db: Db) {}

  async createManyIgnoringExisting(rows: NewObligation[]): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await this.db.obligation.createMany({
      data: rows.map((r) => ({ ...r, amountKobo: big(r.amountKobo) })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /** Allocated = allocations whose payment is CONFIRMED (voided/rejected payments never count). */
  private async select(where: Prisma.Sql): Promise<ObligationRecord[]> {
    const rows = await this.db.$queryRaw<ObligationSqlRow[]>`
      SELECT o.id, o."memberId", o."categoryId", c.name AS "categoryName", o."periodKey", o.label,
             o."amountKobo", o.source, o."createdAt",
             COALESCE(SUM(a."amountKobo") FILTER (WHERE p.status = 'CONFIRMED'), 0)::bigint AS "allocatedKobo"
      FROM "Obligation" o
      JOIN "PaymentCategory" c ON c.id = o."categoryId"
      LEFT JOIN "PaymentAllocation" a ON a."obligationId" = o.id
      LEFT JOIN "Payment" p ON p.id = a."paymentId"
      WHERE ${where}
      GROUP BY o.id, c.name
      ORDER BY o."periodKey", o."createdAt"`;
    return rows.map(toObligation);
  }

  listWithAllocations(filter: ObligationFilter): Promise<ObligationRecord[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (filter.memberId) conditions.push(Prisma.sql`o."memberId" = ${filter.memberId}`);
    if (filter.categoryId) conditions.push(Prisma.sql`o."categoryId" = ${filter.categoryId}`);
    if (filter.year) conditions.push(yearCondition(filter.year));
    return this.select(Prisma.join(conditions, " AND "));
  }

  async lockForAllocation(memberId: string, categoryId: string): Promise<ObligationRecord[]> {
    await this.db.$queryRaw`
      SELECT id FROM "Obligation" WHERE "memberId" = ${memberId} AND "categoryId" = ${categoryId} FOR UPDATE`;
    return this.select(Prisma.sql`o."memberId" = ${memberId} AND o."categoryId" = ${categoryId}`);
  }

  countAuto(categoryId: string, year: number): Promise<number> {
    return this.db.obligation.count({
      where: {
        categoryId,
        source: "AUTO",
        OR: [{ periodKey: String(year) }, { periodKey: { startsWith: `${year}-` } }],
      },
    });
  }

  async repriceUnpaidAuto(categoryId: string, year: number, amountKobo: number): Promise<number> {
    return this.db.$executeRaw`
      UPDATE "Obligation" o SET "amountKobo" = ${big(amountKobo)}, "updatedAt" = now()
      WHERE o."categoryId" = ${categoryId} AND o.source = 'AUTO' AND ${yearCondition(year)}
        AND NOT EXISTS (
          SELECT 1 FROM "PaymentAllocation" a JOIN "Payment" p ON p.id = a."paymentId"
          WHERE a."obligationId" = o.id AND p.status = 'CONFIRMED')`;
  }
}

// ───────────── Payments ─────────────

const PAYMENT_INCLUDE = {
  member: { select: { memberNo: true, fullName: true } },
  category: { select: { name: true } },
  paymentLink: { select: { title: true, purpose: true } },
  bankAccount: { select: { bankName: true, accountNumber: true } },
  receipt: { select: { id: true, receiptNo: true } },
  correctedBy: { select: { id: true } },
} as const;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

function toPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    memberId: row.memberId,
    memberNo: row.member?.memberNo ?? null,
    memberName: row.member?.fullName ?? null,
    payerName: row.payerName,
    payerPhone: row.payerPhone,
    payerEmail: row.payerEmail,
    paymentLinkId: row.paymentLinkId,
    paymentLinkTitle: row.paymentLink?.title ?? null,
    paymentLinkPurpose: row.paymentLink?.purpose ?? null,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    targetObligationId: row.targetObligationId,
    amountKobo: kobo(row.amountKobo),
    method: row.method,
    status: row.status,
    paidOn: fromDb(row.paidOn),
    bankAccountId: row.bankAccountId,
    bankAccountLabel: row.bankAccount ? `${row.bankAccount.bankName} ${row.bankAccount.accountNumber}` : null,
    transferReference: row.transferReference,
    senderName: row.senderName,
    senderBank: row.senderBank,
    proofFileKey: row.proofFileKey,
    recordedById: row.recordedById,
    confirmedById: row.confirmedById,
    confirmedAt: row.confirmedAt,
    rejectionReason: row.rejectionReason,
    voidReason: row.voidReason,
    correctsPaymentId: row.correctsPaymentId,
    correctedById: row.correctedBy?.id ?? null,
    receiptId: row.receipt?.id ?? null,
    receiptNo: row.receipt?.receiptNo ?? null,
    createdAt: row.createdAt,
  };
}

/** The single translation of PaymentQuery into a database filter. */
function paymentWhere(q: PaymentQuery): Prisma.PaymentWhereInput {
  const search = q.search?.trim();
  return {
    memberId: q.memberId,
    categoryId: q.categoryId,
    paymentLinkId: q.paymentLinkId,
    status: q.statuses?.length ? { in: q.statuses } : undefined,
    method: q.method,
    paidOn: q.from || q.to ? { gte: toDbOrUndefined(q.from), lte: toDbOrUndefined(q.to) } : undefined,
    OR: search
      ? [
          { payerName: { contains: search, mode: "insensitive" } },
          { member: { memberNo: { contains: search, mode: "insensitive" } } },
          { member: { fullName: { contains: search, mode: "insensitive" } } },
        ]
      : undefined,
  };
}

// Live = counts for duplicate detection. Rejected and voided (corrected) payments do not.
const LIVE: Prisma.PaymentWhereInput = { status: { notIn: ["REJECTED", "VOIDED"] } };

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly db: Db) {}

  async create(payment: NewPayment): Promise<PaymentRecord> {
    try {
      const row = await this.db.payment.create({
        data: { ...payment, amountKobo: big(payment.amountKobo), paidOn: toDb(payment.paidOn) },
        include: PAYMENT_INCLUDE,
      });
      return toPayment(row);
    } catch (error) {
      // Final guard: the partial unique indexes in the init migration.
      if (isUniqueViolation(error)) throw new ConflictError("This payment has already been recorded.");
      throw error;
    }
  }

  async findById(id: string) {
    const row = await this.db.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
    return row ? toPayment(row) : null;
  }

  async findByGuestTokenHash(hash: string) {
    const row = await this.db.payment.findUnique({ where: { guestAccessTokenHash: hash }, include: PAYMENT_INCLUDE });
    return row ? toPayment(row) : null;
  }

  async findDuplicate(probe: DuplicateProbe) {
    const checks: Array<[keyof DuplicateProbe, Prisma.PaymentWhereInput | null]> = [
      ["idempotencyKey", { idempotencyKey: probe.idempotencyKey }],
      ["proofSha256", probe.proofSha256 ? { ...LIVE, proofSha256: probe.proofSha256 } : null],
    ];
    for (const [field, where] of checks) {
      if (!where) continue;
      const row = await this.db.payment.findFirst({ where, include: PAYMENT_INCLUDE });
      if (row) return { payment: toPayment(row), field };
    }
    return null;
  }

  async list(query: PaymentQuery, page: PageRequest) {
    const where = paymentWhere(query);
    const [rows, total] = await Promise.all([
      this.db.payment.findMany({ where, include: PAYMENT_INCLUDE, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], ...paging(page) }),
      this.db.payment.count({ where }),
    ]);
    return pageResult(rows.map(toPayment), total, page);
  }

  async listAll(query: PaymentQuery) {
    const rows = await this.db.payment.findMany({
      where: paymentWhere(query),
      include: PAYMENT_INCLUDE,
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toPayment);
  }

  async totals(query: PaymentQuery) {
    const result = await this.db.payment.aggregate({
      where: paymentWhere(query),
      _sum: { amountKobo: true },
      _count: { _all: true },
    });
    return { count: result._count._all, totalKobo: kobo(result._sum.amountKobo) };
  }

  async receiptsByCategory(query: PaymentQuery): Promise<CategoryReceipts[]> {
    const groups = await this.db.payment.groupBy({
      by: ["categoryId"],
      where: paymentWhere(query),
      _sum: { amountKobo: true },
      _count: { _all: true },
    });
    const categories = await this.db.paymentCategory.findMany({
      where: { id: { in: groups.map((g) => g.categoryId) } },
      select: { id: true, name: true },
    });
    return groups.map((g) => ({
      categoryId: g.categoryId,
      categoryName: categories.find((c) => c.id === g.categoryId)?.name ?? "Unknown",
      totalKobo: kobo(g._sum.amountKobo),
      count: g._count._all,
    }));
  }

  async markConfirmed(id: string, change: { confirmedById: string; at: Date; linkMemberId?: string }) {
    const result = await this.db.payment.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "CONFIRMED",
        confirmedById: change.confirmedById,
        confirmedAt: change.at,
        ...(change.linkMemberId ? { memberId: change.linkMemberId } : {}),
      },
    });
    return result.count === 1;
  }

  async markRejected(id: string, change: { confirmedById: string; at: Date; reason: string }) {
    const result = await this.db.payment.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", confirmedById: change.confirmedById, confirmedAt: change.at, rejectionReason: change.reason },
    });
    return result.count === 1;
  }

  async markVoided(id: string, change: { reason: string }) {
    const result = await this.db.payment.updateMany({
      where: { id, status: "CONFIRMED" },
      data: { status: "VOIDED", voidReason: change.reason },
    });
    return result.count === 1;
  }
}

// ───────────── Allocations, receipts, receipt numbers ─────────────

export class PrismaAllocationRepository implements AllocationRepository {
  constructor(private readonly db: Db) {}

  async createMany(paymentId: string, allocations: { obligationId: string; amountKobo: number }[]) {
    if (allocations.length === 0) return;
    await this.db.paymentAllocation.createMany({
      data: allocations.map((a) => ({ paymentId, obligationId: a.obligationId, amountKobo: big(a.amountKobo) })),
    });
  }

  async listForPayment(paymentId: string): Promise<AllocationRecord[]> {
    const rows = await this.db.paymentAllocation.findMany({
      where: { paymentId },
      include: { obligation: { select: { periodKey: true, label: true } } },
      orderBy: { obligation: { periodKey: "asc" } },
    });
    return rows.map((r) => ({
      obligationId: r.obligationId,
      periodKey: r.obligation.periodKey,
      label: r.obligation.label,
      amountKobo: kobo(r.amountKobo),
    }));
  }
}

function toReceipt(row: { id: string; receiptNo: string; paymentId: string; issuedAt: Date; snapshot: unknown }): ReceiptRecord {
  return { ...row, snapshot: row.snapshot as ReceiptSnapshot };
}

export class PrismaReceiptRepository implements ReceiptRepository {
  constructor(private readonly db: Db) {}

  async create(receipt: { receiptNo: string; paymentId: string; snapshot: ReceiptSnapshot }) {
    return toReceipt(await this.db.receipt.create({ data: { ...receipt, snapshot: json(receipt.snapshot) } }));
  }

  async findById(id: string) {
    const row = await this.db.receipt.findUnique({ where: { id } });
    return row ? toReceipt(row) : null;
  }

  async findByPaymentId(paymentId: string) {
    const row = await this.db.receipt.findUnique({ where: { paymentId } });
    return row ? toReceipt(row) : null;
  }
}

export class PrismaReceiptNumberGenerator implements ReceiptNumberGenerator {
  constructor(
    private readonly db: Db,
    private readonly prefix: string,
  ) {}

  /** Atomic increment: concurrent confirmations can never get the same number. */
  async next(year: number): Promise<string> {
    const [row] = await this.db.$queryRaw<{ lastValue: number }[]>`
      INSERT INTO "ReceiptCounter" (year, "lastValue") VALUES (${year}, 1)
      ON CONFLICT (year) DO UPDATE SET "lastValue" = "ReceiptCounter"."lastValue" + 1
      RETURNING "lastValue"`;
    return `${this.prefix}-${year}-${String(row.lastValue).padStart(6, "0")}`;
  }
}

export type { PaymentMethod, PaymentStatus };
