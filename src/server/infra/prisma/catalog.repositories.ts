import "server-only";
import type { BankAccountUsage, LinkStatus, MemberStatus, Pricing } from "@/domain/enums";
import type {
  BankAccountRecord,
  BankAccountRepository,
  CategoryRecord,
  CategoryRepository,
  FinancialYearRecord,
  FinancialYearRepository,
  MemberRecord,
  MemberRepository,
  NewMember,
  NewPaymentLink,
  PageRequest,
  PaymentLinkRecord,
  PaymentLinkRepository,
  RateRecord,
  RateRepository,
} from "@/server/ports/repositories";
import type { Frequency } from "@/domain/enums";
import { big, bigOrNull, fromDb, kobo, koboOrNull, pageResult, paging, toDb, uniqueOr, type Db } from "./db";

// ───────────── Members ─────────────

type MemberRow = {
  id: string;
  memberNo: string;
  fullName: string;
  phone: string;
  email: string | null;
  joinedAt: Date;
  status: MemberStatus;
  user: { id: string } | null;
};

const MEMBER_INCLUDE = { user: { select: { id: true } } } as const;

function toMember(row: MemberRow): MemberRecord {
  return {
    id: row.id,
    memberNo: row.memberNo,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    joinedAt: fromDb(row.joinedAt),
    status: row.status,
    hasLogin: row.user !== null,
  };
}

function memberData(member: Partial<NewMember>) {
  return { ...member, joinedAt: member.joinedAt ? toDb(member.joinedAt) : undefined };
}

export class PrismaMemberRepository implements MemberRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string) {
    const row = await this.db.member.findUnique({ where: { id }, include: MEMBER_INCLUDE });
    return row ? toMember(row) : null;
  }

  async findMatching(contact: { phone?: string | null; email?: string | null }) {
    const or = [
      ...(contact.phone ? [{ phone: contact.phone }] : []),
      ...(contact.email ? [{ email: { equals: contact.email, mode: "insensitive" as const } }] : []),
    ];
    if (or.length === 0) return [];
    const rows = await this.db.member.findMany({ where: { OR: or }, include: MEMBER_INCLUDE, take: 5 });
    return rows.map(toMember);
  }

  async list(filter: { search?: string; status?: MemberStatus }, page: PageRequest) {
    const search = filter.search?.trim();
    const where = {
      status: filter.status,
      OR: search
        ? [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { memberNo: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" as const } },
          ]
        : undefined,
    };
    const [rows, total] = await Promise.all([
      this.db.member.findMany({ where, include: MEMBER_INCLUDE, orderBy: { memberNo: "asc" }, ...paging(page) }),
      this.db.member.count({ where }),
    ]);
    return pageResult(rows.map(toMember), total, page);
  }

  async listActive() {
    const rows = await this.db.member.findMany({ where: { status: "ACTIVE" }, include: MEMBER_INCLUDE });
    return rows.map(toMember);
  }

  async create(member: NewMember) {
    const row = await uniqueOr(
      () => this.db.member.create({ data: { ...member, joinedAt: toDb(member.joinedAt) }, include: MEMBER_INCLUDE }),
      "A member with that member number already exists.",
    );
    return toMember(row);
  }

  async update(id: string, patch: Partial<NewMember>) {
    const row = await uniqueOr(
      () => this.db.member.update({ where: { id }, data: memberData(patch), include: MEMBER_INCLUDE }),
      "A member with that member number already exists.",
    );
    return toMember(row);
  }

  async nextMemberNo(): Promise<string> {
    const last = await this.db.member.findFirst({ orderBy: { memberNo: "desc" }, select: { memberNo: true } });
    const n = last ? Number(/(\d+)$/.exec(last.memberNo)?.[1] ?? 0) : 0;
    return `CYON-${String(n + 1).padStart(4, "0")}`;
  }
}

// ───────────── Categories ─────────────

type CategoryRow = Omit<CategoryRecord, "startsOn"> & { startsOn: Date };

function toCategory(row: CategoryRow): CategoryRecord {
  return { id: row.id, name: row.name, group: row.group, pricing: row.pricing, startsOn: fromDb(row.startsOn), isActive: row.isActive };
}

const CATEGORY_TAKEN = "A category with that name already exists.";

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string) {
    const row = await this.db.paymentCategory.findUnique({ where: { id } });
    return row ? toCategory(row) : null;
  }

  async list(filter: { activeOnly?: boolean; pricing?: Pricing } = {}) {
    const rows = await this.db.paymentCategory.findMany({
      where: { isActive: filter.activeOnly ? true : undefined, pricing: filter.pricing },
      orderBy: [{ group: "asc" }, { name: "asc" }],
    });
    return rows.map(toCategory);
  }

  async create(category: Omit<CategoryRecord, "id">) {
    const row = await uniqueOr(
      () => this.db.paymentCategory.create({ data: { ...category, startsOn: toDb(category.startsOn) } }),
      CATEGORY_TAKEN,
    );
    return toCategory(row);
  }

  async update(id: string, patch: Partial<Omit<CategoryRecord, "id">>) {
    const row = await uniqueOr(
      () =>
        this.db.paymentCategory.update({
          where: { id },
          data: { ...patch, startsOn: patch.startsOn ? toDb(patch.startsOn) : undefined },
        }),
      CATEGORY_TAKEN,
    );
    return toCategory(row);
  }
}

// ───────────── Rates ─────────────

type RateRow = {
  id: string;
  categoryId: string;
  year: number;
  frequency: Frequency;
  amountKobo: bigint;
  note: string | null;
  setById: string;
  updatedAt: Date;
  category: { name: string };
};

const RATE_INCLUDE = { category: { select: { name: true } } } as const;

function toRate(row: RateRow): RateRecord {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    year: row.year,
    frequency: row.frequency,
    amountKobo: kobo(row.amountKobo),
    note: row.note,
    setById: row.setById,
    updatedAt: row.updatedAt,
  };
}

export class PrismaRateRepository implements RateRepository {
  constructor(private readonly db: Db) {}

  async find(categoryId: string, year: number) {
    const row = await this.db.categoryRate.findUnique({ where: { categoryId_year: { categoryId, year } }, include: RATE_INCLUDE });
    return row ? toRate(row) : null;
  }

  async listForYear(year: number) {
    const rows = await this.db.categoryRate.findMany({ where: { year }, include: RATE_INCLUDE, orderBy: { category: { name: "asc" } } });
    return rows.map(toRate);
  }

  async listUpToYear(year: number) {
    const rows = await this.db.categoryRate.findMany({ where: { year: { lte: year } }, include: RATE_INCLUDE });
    return rows.map(toRate);
  }

  async upsert(rate: { categoryId: string; year: number; frequency: Frequency; amountKobo: number; note: string | null; setById: string }) {
    const data = { frequency: rate.frequency, amountKobo: big(rate.amountKobo), note: rate.note, setById: rate.setById };
    const row = await this.db.categoryRate.upsert({
      where: { categoryId_year: { categoryId: rate.categoryId, year: rate.year } },
      create: { categoryId: rate.categoryId, year: rate.year, ...data },
      update: data,
      include: RATE_INCLUDE,
    });
    return toRate(row);
  }
}

// ───────────── Financial years ─────────────

function toFinancialYear(row: {
  id: string;
  year: number;
  broughtForwardKobo: bigint;
  note: string | null;
  recordedById: string;
  updatedAt: Date;
}): FinancialYearRecord {
  return { ...row, broughtForwardKobo: kobo(row.broughtForwardKobo) };
}

export class PrismaFinancialYearRepository implements FinancialYearRepository {
  constructor(private readonly db: Db) {}

  async find(year: number) {
    const row = await this.db.financialYear.findUnique({ where: { year } });
    return row ? toFinancialYear(row) : null;
  }

  async list() {
    const rows = await this.db.financialYear.findMany({ orderBy: { year: "desc" } });
    return rows.map(toFinancialYear);
  }

  async upsert(row: { year: number; broughtForwardKobo: number; note: string | null; recordedById: string }) {
    const data = { broughtForwardKobo: big(row.broughtForwardKobo), note: row.note, recordedById: row.recordedById };
    const saved = await this.db.financialYear.upsert({
      where: { year: row.year },
      create: { year: row.year, ...data },
      update: data,
    });
    return toFinancialYear(saved);
  }
}

// ───────────── Bank accounts ─────────────

export class PrismaBankAccountRepository implements BankAccountRepository {
  constructor(private readonly db: Db) {}

  findById(id: string): Promise<BankAccountRecord | null> {
    return this.db.bankAccount.findUnique({ where: { id }, select: BANK_SELECT });
  }

  list(filter: { usage?: BankAccountUsage; activeOnly?: boolean } = {}): Promise<BankAccountRecord[]> {
    return this.db.bankAccount.findMany({
      where: { usage: filter.usage, isActive: filter.activeOnly ? true : undefined },
      orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
      select: BANK_SELECT,
    });
  }

  create(account: Omit<BankAccountRecord, "id">): Promise<BankAccountRecord> {
    return uniqueOr(() => this.db.bankAccount.create({ data: account, select: BANK_SELECT }), BANK_TAKEN);
  }

  update(id: string, patch: Partial<Omit<BankAccountRecord, "id">>): Promise<BankAccountRecord> {
    return uniqueOr(() => this.db.bankAccount.update({ where: { id }, data: patch, select: BANK_SELECT }), BANK_TAKEN);
  }
}

const BANK_TAKEN = "That bank account has already been added.";

const BANK_SELECT = {
  id: true,
  bankName: true,
  accountName: true,
  accountNumber: true,
  usage: true,
  isActive: true,
  sortOrder: true,
} as const;

// ───────────── Payment links ─────────────

export class PrismaPaymentLinkRepository implements PaymentLinkRepository {
  constructor(private readonly db: Db) {}

  private static readonly include = {
    category: { select: { name: true } },
    bankAccount: { select: BANK_SELECT },
  } as const;

  private async withTotals(
    rows: Array<
      Omit<PaymentLinkRecord, "categoryName" | "bankAccount" | "amountKobo" | "targetKobo" | "confirmedTotalKobo" | "confirmedCount" | "pendingCount"> & {
        amountKobo: bigint | null;
        targetKobo: bigint | null;
        category: { name: string };
        bankAccount: BankAccountRecord;
      }
    >,
  ): Promise<PaymentLinkRecord[]> {
    if (rows.length === 0) return [];
    const totals = await this.db.payment.groupBy({
      by: ["paymentLinkId", "status"],
      where: { paymentLinkId: { in: rows.map((r) => r.id) }, status: { in: ["CONFIRMED", "PENDING"] } },
      _sum: { amountKobo: true },
      _count: { _all: true },
    });
    return rows.map(({ category, ...row }) => {
      const confirmed = totals.find((t) => t.paymentLinkId === row.id && t.status === "CONFIRMED");
      const pending = totals.find((t) => t.paymentLinkId === row.id && t.status === "PENDING");
      return {
        ...row,
        categoryName: category.name,
        amountKobo: koboOrNull(row.amountKobo),
        targetKobo: koboOrNull(row.targetKobo),
        confirmedTotalKobo: kobo(confirmed?._sum.amountKobo),
        confirmedCount: confirmed?._count._all ?? 0,
        pendingCount: pending?._count._all ?? 0,
      };
    });
  }

  async findById(id: string) {
    const row = await this.db.paymentLink.findUnique({ where: { id }, include: PrismaPaymentLinkRepository.include });
    return row ? (await this.withTotals([row]))[0] : null;
  }

  async findBySlug(slug: string) {
    const row = await this.db.paymentLink.findUnique({ where: { slug }, include: PrismaPaymentLinkRepository.include });
    return row ? (await this.withTotals([row]))[0] : null;
  }

  async list() {
    const rows = await this.db.paymentLink.findMany({ include: PrismaPaymentLinkRepository.include, orderBy: { createdAt: "desc" } });
    return this.withTotals(rows);
  }

  async create(link: NewPaymentLink) {
    const row = await this.db.paymentLink.create({
      data: { ...link, amountKobo: bigOrNull(link.amountKobo), targetKobo: bigOrNull(link.targetKobo) },
      include: PrismaPaymentLinkRepository.include,
    });
    return (await this.withTotals([row]))[0];
  }

  async setStatus(id: string, status: LinkStatus, at: Date) {
    const row = await this.db.paymentLink.update({
      where: { id },
      data: { status, closedAt: status === "CLOSED" ? at : null },
      include: PrismaPaymentLinkRepository.include,
    });
    return (await this.withTotals([row]))[0];
  }
}
