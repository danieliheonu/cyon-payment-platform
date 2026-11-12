/**
 * Repository ports. Services depend on these interfaces only (Dependency Inversion);
 * Prisma implementations live in src/server/infra/prisma/. Interfaces are kept
 * small and per-aggregate (Interface Segregation).
 *
 * All money is `Kobo` (number); all calendar dates are `DateOnly` strings.
 */
import type { DateOnly } from "@/lib/dates";
import type { Kobo } from "@/domain/money";
import type {
  AmountMode,
  BankAccountUsage,
  CategoryGroup,
  FinanceArea,
  Frequency,
  LinkStatus,
  MemberStatus,
  ObligationSource,
  PaymentMethod,
  PaymentStatus,
  Pricing,
  Role,
} from "@/domain/enums";
import type { CategoryReceipts } from "@/domain/year-summary";
import type { GrantReader } from "@/server/auth/permission-resolver";

// ───────────── Shared ─────────────

export interface PageRequest {
  page: number; // 1-based
  pageSize: number;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ───────────── Users, sessions, grants ─────────────

export interface UserRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  memberId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export type NewUser = Pick<UserRecord, "name" | "email" | "phone" | "passwordHash" | "role" | "memberId"> & {
  mustChangePassword: boolean;
};

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByPhone(phone: string): Promise<UserRecord | null>;
  findByMemberId(memberId: string): Promise<UserRecord | null>;
  create(user: NewUser): Promise<UserRecord>;
  update(
    id: string,
    patch: Partial<Pick<UserRecord, "name" | "email" | "phone" | "passwordHash" | "role" | "isActive" | "mustChangePassword" | "lastLoginAt">>,
  ): Promise<UserRecord>;
  list(filter: { roles?: Role[]; search?: string }): Promise<UserRecord[]>;
  countActive(role: Role): Promise<number>;
}

export interface SessionRepository {
  create(session: { tokenHash: string; userId: string; expiresAt: Date }): Promise<void>;
  findActive(tokenHash: string, now: Date): Promise<{ userId: string; expiresAt: Date } | null>;
  extend(tokenHash: string, expiresAt: Date): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
  /** Housekeeping: removes sessions that expired before `now`. Returns how many. */
  deleteExpired(now: Date): Promise<number>;
}

/** Counted events for rate limiting (failed sign-ins, public submissions). */
export interface RateLimitRepository {
  count(key: string, since: Date): Promise<number>;
  record(keys: readonly string[], at: Date): Promise<void>;
  clear(key: string): Promise<void>;
  purgeBefore(at: Date): Promise<number>;
}

export interface GrantView {
  id: string;
  userId: string;
  userName: string;
  area: FinanceArea;
  reason: string;
  grantedById: string;
  grantedByName: string;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedByName: string | null;
  revokeReason: string | null;
}

export interface GrantRepository extends GrantReader {
  create(grant: { userId: string; area: FinanceArea; reason: string; grantedById: string; expiresAt: Date | null }): Promise<GrantView>;
  findUnrevoked(userId: string, area: FinanceArea): Promise<GrantView | null>;
  findById(id: string): Promise<GrantView | null>;
  revoke(id: string, revoke: { revokedById: string; reason: string; at: Date }): Promise<GrantView>;
  list(filter: { userId?: string }): Promise<GrantView[]>;
}

// ───────────── Members ─────────────

export interface MemberRecord {
  id: string;
  memberNo: string;
  fullName: string;
  phone: string;
  email: string | null;
  joinedAt: DateOnly;
  status: MemberStatus;
  hasLogin: boolean;
}

export type NewMember = Omit<MemberRecord, "id" | "hasLogin">;

export interface MemberRepository {
  findById(id: string): Promise<MemberRecord | null>;
  /** Members whose phone or email matches (used to link guest payments). */
  findMatching(contact: { phone?: string | null; email?: string | null }): Promise<MemberRecord[]>;
  list(filter: { search?: string; status?: MemberStatus }, page: PageRequest): Promise<PageResult<MemberRecord>>;
  listActive(): Promise<MemberRecord[]>;
  create(member: NewMember): Promise<MemberRecord>;
  update(id: string, patch: Partial<NewMember>): Promise<MemberRecord>;
  nextMemberNo(): Promise<string>;
}

// ───────────── Categories, rates, financial years ─────────────

export interface CategoryRecord {
  id: string;
  name: string;
  group: CategoryGroup;
  pricing: Pricing;
  startsOn: DateOnly;
  isActive: boolean;
}

export interface CategoryRepository {
  findById(id: string): Promise<CategoryRecord | null>;
  list(filter?: { activeOnly?: boolean; pricing?: Pricing }): Promise<CategoryRecord[]>;
  create(category: Omit<CategoryRecord, "id">): Promise<CategoryRecord>;
  update(id: string, patch: Partial<Omit<CategoryRecord, "id">>): Promise<CategoryRecord>;
}

export interface RateRecord {
  id: string;
  categoryId: string;
  categoryName: string;
  year: number;
  frequency: Frequency;
  amountKobo: Kobo;
  note: string | null;
  setById: string;
  updatedAt: Date;
}

export interface RateRepository {
  find(categoryId: string, year: number): Promise<RateRecord | null>;
  listForYear(year: number): Promise<RateRecord[]>;
  /** Rates for every year up to and including `year` (used by obligation generation). */
  listUpToYear(year: number): Promise<RateRecord[]>;
  upsert(rate: { categoryId: string; year: number; frequency: Frequency; amountKobo: Kobo; note: string | null; setById: string }): Promise<RateRecord>;
}

export interface FinancialYearRecord {
  id: string;
  year: number;
  broughtForwardKobo: Kobo;
  note: string | null;
  recordedById: string;
  updatedAt: Date;
}

export interface FinancialYearRepository {
  find(year: number): Promise<FinancialYearRecord | null>;
  list(): Promise<FinancialYearRecord[]>;
  upsert(row: { year: number; broughtForwardKobo: Kobo; note: string | null; recordedById: string }): Promise<FinancialYearRecord>;
}

// ───────────── Obligations (what members owe) ─────────────

export interface ObligationRecord {
  id: string;
  memberId: string;
  categoryId: string;
  categoryName: string;
  periodKey: string;
  label: string;
  amountKobo: Kobo;
  source: ObligationSource;
  createdAt: Date;
  /** Sum of allocations from CONFIRMED payments only. */
  allocatedKobo: Kobo;
}

export interface NewObligation {
  memberId: string;
  categoryId: string;
  periodKey: string;
  label: string;
  amountKobo: Kobo;
  source: ObligationSource;
  createdById: string | null;
}

export interface ObligationFilter {
  memberId?: string;
  categoryId?: string;
  /** Matches period keys of that financial year: 2026, 2026-03, 2026-Q1, 2026-<event>. */
  year?: number;
}

export interface ObligationRepository {
  /** Inserts rows; rows that already exist (same member/category/period) are skipped. Returns rows inserted. */
  createManyIgnoringExisting(rows: NewObligation[]): Promise<number>;
  /** Obligations with their confirmed allocations; balances are computed by src/domain/balance.ts. */
  listWithAllocations(filter: ObligationFilter): Promise<ObligationRecord[]>;
  /** Locks the member's obligations in a category (SELECT … FOR UPDATE) and returns them for allocation. */
  lockForAllocation(memberId: string, categoryId: string): Promise<ObligationRecord[]>;
  countAuto(categoryId: string, year: number): Promise<number>;
  /** Re-prices AUTO obligations of `year` that have no confirmed allocations. Returns rows changed. */
  repriceUnpaidAuto(categoryId: string, year: number, amountKobo: Kobo): Promise<number>;
}

// ───────────── Bank accounts & payment links ─────────────

export interface BankAccountRecord {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  usage: BankAccountUsage;
  isActive: boolean;
  sortOrder: number;
}

export interface BankAccountRepository {
  findById(id: string): Promise<BankAccountRecord | null>;
  list(filter?: { usage?: BankAccountUsage; activeOnly?: boolean }): Promise<BankAccountRecord[]>;
  create(account: Omit<BankAccountRecord, "id">): Promise<BankAccountRecord>;
  update(id: string, patch: Partial<Omit<BankAccountRecord, "id">>): Promise<BankAccountRecord>;
}

export interface PaymentLinkRecord {
  id: string;
  slug: string;
  title: string;
  purpose: string;
  categoryId: string;
  categoryName: string;
  bankAccount: BankAccountRecord;
  amountMode: AmountMode;
  amountKobo: Kobo | null;
  targetKobo: Kobo | null;
  closesAt: Date | null;
  autoCloseOnTarget: boolean;
  status: LinkStatus;
  closedAt: Date | null;
  createdAt: Date;
  confirmedTotalKobo: Kobo;
  confirmedCount: number;
  pendingCount: number;
}

export type NewPaymentLink = Pick<
  PaymentLinkRecord,
  "slug" | "title" | "purpose" | "categoryId" | "amountMode" | "amountKobo" | "targetKobo" | "closesAt" | "autoCloseOnTarget"
> & { bankAccountId: string; createdById: string };

export interface PaymentLinkRepository {
  findById(id: string): Promise<PaymentLinkRecord | null>;
  findBySlug(slug: string): Promise<PaymentLinkRecord | null>;
  list(): Promise<PaymentLinkRecord[]>;
  create(link: NewPaymentLink): Promise<PaymentLinkRecord>;
  setStatus(id: string, status: LinkStatus, at: Date): Promise<PaymentLinkRecord>;
}

// ───────────── Payments, allocations, receipts ─────────────

/** The single filter object behind payment lists, history, summaries, per-link reports and CSV. */
export interface PaymentQuery {
  memberId?: string;
  categoryId?: string;
  paymentLinkId?: string;
  statuses?: PaymentStatus[];
  method?: PaymentMethod;
  from?: DateOnly;
  to?: DateOnly;
  /** Matches payer name, member number or transfer reference. */
  search?: string;
}

export interface PaymentRecord {
  id: string;
  memberId: string | null;
  memberNo: string | null;
  memberName: string | null;
  payerName: string;
  payerPhone: string | null;
  payerEmail: string | null;
  paymentLinkId: string | null;
  paymentLinkTitle: string | null;
  paymentLinkPurpose: string | null;
  categoryId: string;
  categoryName: string;
  targetObligationId: string | null;
  amountKobo: Kobo;
  method: PaymentMethod;
  status: PaymentStatus;
  paidOn: DateOnly;
  bankAccountId: string | null;
  bankAccountLabel: string | null;
  transferReference: string | null;
  senderName: string | null;
  senderBank: string | null;
  proofFileKey: string | null;
  recordedById: string | null;
  confirmedById: string | null;
  confirmedAt: Date | null;
  rejectionReason: string | null;
  voidReason: string | null;
  correctsPaymentId: string | null;
  correctedById: string | null;
  receiptId: string | null;
  receiptNo: string | null;
  createdAt: Date;
}

export interface NewPayment {
  memberId: string | null;
  payerName: string;
  payerPhone: string | null;
  payerEmail: string | null;
  paymentLinkId: string | null;
  guestAccessTokenHash: string | null;
  categoryId: string;
  targetObligationId: string | null;
  amountKobo: Kobo;
  method: PaymentMethod;
  status: PaymentStatus;
  paidOn: DateOnly;
  bankAccountId: string | null;
  transferReference: string | null;
  senderName: string | null;
  senderBank: string | null;
  proofFileKey: string | null;
  proofSha256: string | null;
  idempotencyKey: string;
  recordedById: string | null;
  confirmedById: string | null;
  confirmedAt: Date | null;
  correctsPaymentId: string | null;
}

export interface DuplicateProbe {
  idempotencyKey: string;
  proofSha256: string | null;
}

export interface PaymentRepository {
  create(payment: NewPayment): Promise<PaymentRecord>;
  findById(id: string): Promise<PaymentRecord | null>;
  findByGuestTokenHash(hash: string): Promise<PaymentRecord | null>;
  /** Finds a live (non-rejected) payment that would duplicate this one. */
  findDuplicate(probe: DuplicateProbe): Promise<{ payment: PaymentRecord; field: keyof DuplicateProbe } | null>;
  list(query: PaymentQuery, page: PageRequest): Promise<PageResult<PaymentRecord>>;
  listAll(query: PaymentQuery): Promise<PaymentRecord[]>;
  totals(query: PaymentQuery): Promise<{ count: number; totalKobo: Kobo }>;
  receiptsByCategory(query: PaymentQuery): Promise<CategoryReceipts[]>;
  /** Status transitions only succeed from the expected current status; return false otherwise. */
  markConfirmed(id: string, change: { confirmedById: string; at: Date; linkMemberId?: string }): Promise<boolean>;
  markRejected(id: string, change: { confirmedById: string; at: Date; reason: string }): Promise<boolean>;
  markVoided(id: string, change: { reason: string }): Promise<boolean>;
}

export interface AllocationRecord {
  obligationId: string;
  periodKey: string;
  label: string;
  amountKobo: Kobo;
}

export interface AllocationRepository {
  createMany(paymentId: string, allocations: { obligationId: string; amountKobo: Kobo }[]): Promise<void>;
  listForPayment(paymentId: string): Promise<AllocationRecord[]>;
}

/** Frozen at confirmation; receipts always render from this snapshot. */
export interface ReceiptSnapshot {
  orgName: string;
  receiptNo: string;
  payerName: string;
  memberNo: string | null;
  purpose: string;
  categoryName: string;
  coverage: string[];
  amountKobo: Kobo;
  paidOn: DateOnly;
  method: PaymentMethod;
  confirmedAt: string; // ISO
  confirmedByName: string;
  replacesReceiptNo: string | null;
}

export interface ReceiptRecord {
  id: string;
  receiptNo: string;
  paymentId: string;
  issuedAt: Date;
  snapshot: ReceiptSnapshot;
}

export interface ReceiptRepository {
  create(receipt: { receiptNo: string; paymentId: string; snapshot: ReceiptSnapshot }): Promise<ReceiptRecord>;
  findById(id: string): Promise<ReceiptRecord | null>;
  findByPaymentId(paymentId: string): Promise<ReceiptRecord | null>;
}

export interface ReceiptNumberGenerator {
  /** Atomically allocates the next receipt number for the year, e.g. CYON-2026-000123. */
  next(year: number): Promise<string>;
}

// ───────────── Audit ─────────────

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface AuditRecord extends Required<Omit<AuditEntry, "before" | "after" | "reason">> {
  id: string;
  actorName: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: Date;
}

export interface AuditRepository {
  record(entry: AuditEntry): Promise<void>;
  list(filter: { entity?: string; entityId?: string }, page: PageRequest): Promise<PageResult<AuditRecord>>;
}

// ───────────── Unit of work ─────────────

export interface Repositories {
  users: UserRepository;
  sessions: SessionRepository;
  rateLimits: RateLimitRepository;
  grants: GrantRepository;
  members: MemberRepository;
  categories: CategoryRepository;
  rates: RateRepository;
  financialYears: FinancialYearRepository;
  obligations: ObligationRepository;
  bankAccounts: BankAccountRepository;
  paymentLinks: PaymentLinkRepository;
  payments: PaymentRepository;
  allocations: AllocationRepository;
  receipts: ReceiptRepository;
  receiptNumbers: ReceiptNumberGenerator;
  audit: AuditRepository;
}

/**
 * Runs work atomically. Every write that must be audited happens inside `run`,
 * together with its audit entry, so the audit trail can never miss a change.
 */
export interface UnitOfWork {
  /** Non-transactional repositories for reads. */
  readonly read: Repositories;
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
