import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AuditEntry,
  AuditRepository,
  PageRequest,
  Repositories,
  UnitOfWork,
} from "@/server/ports/repositories";
import { json, pageResult, paging, type Db } from "./db";
import { PrismaGrantRepository, PrismaRateLimitRepository, PrismaSessionRepository, PrismaUserRepository } from "./identity.repositories";
import {
  PrismaBankAccountRepository,
  PrismaCategoryRepository,
  PrismaFinancialYearRepository,
  PrismaMemberRepository,
  PrismaPaymentLinkRepository,
  PrismaRateRepository,
} from "./catalog.repositories";
import {
  PrismaAllocationRepository,
  PrismaObligationRepository,
  PrismaPaymentRepository,
  PrismaReceiptNumberGenerator,
  PrismaReceiptRepository,
} from "./money.repositories";

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly db: Db) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: json(entry.before),
        after: json(entry.after),
        reason: entry.reason ?? null,
      },
    });
  }

  async list(filter: { entity?: string; entityId?: string }, page: PageRequest) {
    const where = { entity: filter.entity, entityId: filter.entityId };
    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...paging(page) }),
      this.db.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => Boolean(id)))];
    const actors = await this.db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
    return pageResult(
      rows.map((r) => ({ ...r, actorName: actors.find((a) => a.id === r.actorId)?.name ?? null })),
      total,
      page,
    );
  }
}

export function createRepositories(db: Db, receiptPrefix: string): Repositories {
  return {
    users: new PrismaUserRepository(db),
    sessions: new PrismaSessionRepository(db),
    rateLimits: new PrismaRateLimitRepository(db),
    grants: new PrismaGrantRepository(db),
    members: new PrismaMemberRepository(db),
    categories: new PrismaCategoryRepository(db),
    rates: new PrismaRateRepository(db),
    financialYears: new PrismaFinancialYearRepository(db),
    obligations: new PrismaObligationRepository(db),
    bankAccounts: new PrismaBankAccountRepository(db),
    paymentLinks: new PrismaPaymentLinkRepository(db),
    payments: new PrismaPaymentRepository(db),
    allocations: new PrismaAllocationRepository(db),
    receipts: new PrismaReceiptRepository(db),
    receiptNumbers: new PrismaReceiptNumberGenerator(db, receiptPrefix),
    audit: new PrismaAuditRepository(db),
  };
}

export class PrismaUnitOfWork implements UnitOfWork {
  readonly read: Repositories;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly receiptPrefix: string,
  ) {
    this.read = createRepositories(prisma, receiptPrefix);
  }

  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(createRepositories(tx, this.receiptPrefix)), {
      timeout: 20_000,
      maxWait: 10_000,
    });
  }
}
