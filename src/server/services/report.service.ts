import "server-only";
import { assertCan, type Actor } from "@/domain/actor";
import { LABELS, PaymentStatus } from "@/domain/enums";
import { koboToNairaString, type Kobo } from "@/domain/money";
import { Permission } from "@/domain/permissions";
import { buildYearSummary, type CategoryReceipts, type YearSummary } from "@/domain/year-summary";
import { yearRange } from "@/lib/dates";
import type { Clock, FileStorage } from "@/server/ports/file-storage";
import type { DocumentRenderer } from "@/server/ports/receipt-renderer";
import type { PaymentQuery, RateRecord, UnitOfWork } from "@/server/ports/repositories";
import { toCsv } from "@/server/infra/csv";
import type { MemberBalance, ObligationService } from "./obligation.service";
import { toLagosDateOnly } from "@/lib/dates";

export interface PaymentSummary {
  confirmedTotalKobo: Kobo;
  confirmedCount: number;
  pendingCount: number;
  pendingTotalKobo: Kobo;
  byCategory: CategoryReceipts[];
  outstandingKobo: Kobo;
}

/** Summaries, yearly financial summary and downloads. Staff only (VIEW_REPORTS). */
export class ReportService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly obligations: ObligationService,
    private readonly renderer: DocumentRenderer,
    private readonly orgName: string,
    private readonly clock: Clock,
  ) {}

  /** Only CONFIRMED payments count toward totals (PRD rule). */
  async summary(actor: Actor, query: Omit<PaymentQuery, "statuses">): Promise<PaymentSummary> {
    assertCan(actor, Permission.VIEW_REPORTS);
    const confirmed = { ...query, statuses: [PaymentStatus.CONFIRMED] };
    const pending = { ...query, statuses: [PaymentStatus.PENDING] };
    const [totals, pendingTotals, byCategory, balance] = await Promise.all([
      this.uow.read.payments.totals(confirmed),
      this.uow.read.payments.totals(pending),
      this.uow.read.payments.receiptsByCategory(confirmed),
      this.obligations.totalBalance({ memberId: query.memberId, categoryId: query.categoryId }),
    ]);
    return {
      confirmedTotalKobo: totals.totalKobo,
      confirmedCount: totals.count,
      pendingCount: pendingTotals.count,
      pendingTotalKobo: pendingTotals.totalKobo,
      byCategory: byCategory.sort((a, b) => b.totalKobo - a.totalKobo),
      outstandingKobo: balance.outstandingKobo,
    };
  }

  async yearSummary(actor: Actor, year: number): Promise<{ summary: YearSummary; rates: RateRecord[] }> {
    assertCan(actor, Permission.VIEW_REPORTS);
    const [financialYear, receipts, balance, rates] = await Promise.all([
      this.uow.read.financialYears.find(year),
      this.uow.read.payments.receiptsByCategory({ ...yearRange(year), statuses: [PaymentStatus.CONFIRMED] }),
      this.obligations.totalBalance({ year }),
      this.uow.read.rates.listForYear(year),
    ]);
    const summary = buildYearSummary({
      year,
      broughtForwardKobo: financialYear?.broughtForwardKobo ?? null,
      receiptsByCategory: receipts,
      outstandingKobo: balance.outstandingKobo,
    });
    return { summary, rates };
  }

  async yearSummaryCsv(actor: Actor, year: number): Promise<string> {
    const { summary } = await this.yearSummary(actor, year);
    return toCsv(
      ["Line", "Count", "Amount (NGN)"],
      [
        [`Balance brought forward from ${year - 1}${summary.broughtForwardRecorded ? "" : " (not recorded)"}`, "", koboToNairaString(summary.broughtForwardKobo)],
        ...summary.receiptsByCategory.map((c) => [`Received: ${c.categoryName}`, String(c.count), koboToNairaString(c.totalKobo)]),
        ["Total received (confirmed)", "", koboToNairaString(summary.totalReceiptsKobo)],
        ["Total funds (brought forward + received)", "", koboToNairaString(summary.totalFundsKobo)],
        ["Outstanding member balances", "", koboToNairaString(summary.outstandingKobo)],
      ],
    );
  }

  async yearSummaryPdf(actor: Actor, year: number): Promise<Uint8Array> {
    const { summary, rates } = await this.yearSummary(actor, year);
    return this.renderer.yearSummaryPdf({ orgName: this.orgName, summary, rates, generatedAt: this.clock.now() });
  }

  /** Payments CSV for record keeping — the same PaymentQuery as the on-screen list. */
  async paymentsCsv(actor: Actor, query: PaymentQuery): Promise<string> {
    assertCan(actor, Permission.VIEW_REPORTS);
    const payments = await this.uow.read.payments.listAll(query);
    return toCsv(
      ["Payment date", "Receipt no", "Member no", "Payer", "Category", "Payment link", "Amount (NGN)", "Method", "Status", "Note", "Confirmed at"],
      payments.map((p) => [
        p.paidOn,
        p.receiptNo ?? "",
        p.memberNo ?? "",
        p.memberName ?? p.payerName,
        p.categoryName,
        p.paymentLinkTitle ?? "",
        koboToNairaString(p.amountKobo),
        LABELS.paymentMethod[p.method],
        LABELS.paymentStatus[p.status],
        p.method === "CASH" ? (p.transferReference ?? "") : "",
        p.confirmedAt ? p.confirmedAt.toISOString() : "",
      ]),
    );
  }

  /** Per-member balances (staff only) — the same rows on screen and in the CSV. */
  async memberBalances(actor: Actor, filter: { year?: number; categoryId?: string }): Promise<MemberBalance[]> {
    assertCan(actor, Permission.VIEW_REPORTS);
    return this.obligations.memberBalances(filter);
  }

  async balancesCsv(actor: Actor, filter: { year?: number; categoryId?: string }): Promise<string> {
    const rows = await this.memberBalances(actor, filter);
    return toCsv(
      ["Member no", "Name", "Due (NGN)", "Paid (NGN)", "Outstanding (NGN)"],
      rows.map((r) => [r.memberNo, r.fullName, koboToNairaString(r.dueKobo), koboToNairaString(r.paidKobo), koboToNairaString(r.outstandingKobo)]),
    );
  }
}

/** Weekly CSV export of every payment-related table to private storage (in addition to Supabase backups). */
export class BackupService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly storage: FileStorage,
    private readonly clock: Clock,
  ) {}

  async run(): Promise<string[]> {
    const { read } = this.uow;
    const stamp = toLagosDateOnly(this.clock.now());
    const [payments, members, rates, years, links, accounts] = await Promise.all([
      read.payments.listAll({}),
      read.members.list({}, { page: 1, pageSize: 1_000_000 }),
      read.rates.listUpToYear(9999),
      read.financialYears.list(),
      read.paymentLinks.list(),
      read.bankAccounts.list(),
    ]);
    const obligations = await read.obligations.listWithAllocations({});
    const files: Record<string, string> = {
      "payments.csv": recordsCsv(payments),
      "members.csv": recordsCsv(members.rows),
      "obligations.csv": recordsCsv(obligations),
      "rates.csv": recordsCsv(rates),
      "financial-years.csv": recordsCsv(years),
      "payment-links.csv": recordsCsv(links),
      "bank-accounts.csv": recordsCsv(accounts),
    };
    const written: string[] = [];
    for (const [name, content] of Object.entries(files)) {
      const key = `backups/${stamp}/${name}`;
      await this.storage.upload(key, new TextEncoder().encode(content), "text/csv");
      written.push(key);
    }
    return written;
  }
}

/** Any list of flat records → CSV with one column per field. */
function recordsCsv(records: readonly object[]): string {
  const headers = Object.keys(records[0] ?? {});
  return toCsv(headers, records.map((r) => headers.map((h) => cell((r as Record<string, unknown>)[h]))));
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
