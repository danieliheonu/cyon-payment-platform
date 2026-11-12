import "server-only";
import { assertCan, type Actor } from "@/domain/actor";
import { outstandingKobo, summarizeBalances, type BalanceSummary } from "@/domain/balance";
import { Frequency, Pricing } from "@/domain/enums";
import { NotFoundError, RuleError } from "@/domain/errors";
import { eventPeriodKey } from "@/domain/periods";
import { Permission } from "@/domain/permissions";
import { duePeriods } from "@/domain/recurrence";
import { maxDateOnly, toLagosDateOnly, yearOf, type DateOnly } from "@/lib/dates";
import type { Clock } from "@/server/ports/file-storage";
import type { NewObligation, ObligationFilter, ObligationRecord, UnitOfWork } from "@/server/ports/repositories";
import type { ChargeInput } from "@/lib/validation/schemas";

export interface MemberBalance extends BalanceSummary {
  memberId: string;
  memberNo: string;
  fullName: string;
}

export interface CategoryBalance extends BalanceSummary {
  categoryId: string;
  categoryName: string;
  open: Array<ObligationRecord & { outstandingKobo: number }>;
}

export interface ChargeSummary extends BalanceSummary {
  categoryId: string;
  categoryName: string;
  periodKey: string;
  label: string;
  members: number;
  source: ObligationRecord["source"];
}

/** Narrow port used by services that need to (re)generate dues (Interface Segregation). */
export interface DuesGenerator {
  generateDue(filter?: { memberId?: string; categoryId?: string }): Promise<number>;
}

/**
 * What members owe: automatic recurring dues (from yearly rates) and one-time
 * charges applied by finance staff. Balances use the domain balance calculator.
 */
export class ObligationService implements DuesGenerator {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * Idempotent: creates any missing AUTO obligations for every active member and
   * FIXED recurring category, for each year that has a rate, up to today.
   */
  async generateDue(filter: { memberId?: string; categoryId?: string } = {}): Promise<number> {
    const asOf: DateOnly = toLagosDateOnly(this.clock.now());
    const { read } = this.uow;
    const [categories, members, rates] = await Promise.all([
      read.categories.list({ activeOnly: true, pricing: Pricing.FIXED }),
      filter.memberId ? read.members.findById(filter.memberId).then((m) => (m && m.status === "ACTIVE" ? [m] : [])) : read.members.listActive(),
      read.rates.listUpToYear(yearOf(asOf)),
    ]);

    const rows: NewObligation[] = [];
    for (const category of categories.filter((c) => !filter.categoryId || c.id === filter.categoryId)) {
      for (const rate of rates.filter((r) => r.categoryId === category.id && r.frequency !== Frequency.ONE_OFF)) {
        for (const member of members) {
          const liableFrom = maxDateOnly(member.joinedAt, category.startsOn);
          for (const period of duePeriods(rate.frequency, rate.year, liableFrom, asOf)) {
            rows.push({
              memberId: member.id,
              categoryId: category.id,
              periodKey: period.key,
              label: `${category.name} — ${period.label}`,
              amountKobo: rate.amountKobo,
              source: "AUTO",
              createdById: null,
            });
          }
        }
      }
    }

    return this.uow.run(async (repos) => {
      const created = await repos.obligations.createManyIgnoringExisting(rows);
      if (created > 0) {
        await repos.audit.record({
          actorId: null,
          action: "obligations.generated",
          entity: "Obligation",
          entityId: filter.memberId ?? filter.categoryId ?? "all",
          after: { created, asOf },
        });
      }
      return created;
    });
  }

  /** Applies a one-time levy or event charge to all active members or selected ones. */
  async applyCharge(actor: Actor, input: ChargeInput): Promise<number> {
    assertCan(actor, Permission.MANAGE_CHARGES);
    const category = await this.uow.read.categories.findById(input.categoryId);
    if (!category) throw new NotFoundError("Category");
    if (category.pricing !== Pricing.FIXED) throw new RuleError("Charges can only be applied for fixed-amount categories.");

    const rate = await this.uow.read.rates.find(category.id, input.year);
    if (rate && rate.frequency !== Frequency.ONE_OFF && !input.amount) {
      throw new RuleError(`${category.name} is billed ${rate.frequency.toLowerCase()} for ${input.year}; those dues are generated automatically.`);
    }
    const amountKobo = input.amount ?? rate?.amountKobo;
    if (!amountKobo) {
      throw new RuleError(`Set the ${input.year} amount for ${category.name} on the Rates page, or enter an amount here.`);
    }

    const members = input.allMembers
      ? await this.uow.read.members.listActive()
      : (await Promise.all(input.memberIds.map((id) => this.uow.read.members.findById(id)))).filter((m) => m !== null);
    if (members.length === 0) throw new RuleError("Select at least one member.");

    const periodKey = input.name ? eventPeriodKey(input.year, input.name) : String(input.year);
    const label = input.name ? `${category.name} — ${input.name}` : `${category.name} — ${input.year}`;

    return this.uow.run(async (repos) => {
      const created = await repos.obligations.createManyIgnoringExisting(
        members.map((m) => ({
          memberId: m.id,
          categoryId: category.id,
          periodKey,
          label,
          amountKobo,
          source: "MANUAL" as const,
          createdById: actor.userId,
        })),
      );
      await repos.audit.record({
        actorId: actor.userId,
        action: "charge.applied",
        entity: "PaymentCategory",
        entityId: category.id,
        after: { periodKey, label, amountKobo, members: members.length, created, allMembers: input.allMembers },
      });
      return created;
    });
  }

  /** A member's obligations with balances — visible to the member and to staff. */
  async forMember(memberId: string, filter: { categoryId?: string } = {}): Promise<ObligationRecord[]> {
    return this.uow.read.obligations.listWithAllocations({ memberId, ...filter });
  }

  /** A member's balances per category, with the open (not fully paid) charges in each. */
  async balancesByCategory(memberId: string): Promise<CategoryBalance[]> {
    const obligations = await this.uow.read.obligations.listWithAllocations({ memberId });
    const byCategory = new Map<string, ObligationRecord[]>();
    for (const o of obligations) byCategory.set(o.categoryId, [...(byCategory.get(o.categoryId) ?? []), o]);
    return [...byCategory.values()]
      .map((rows) => ({
        categoryId: rows[0].categoryId,
        categoryName: rows[0].categoryName,
        ...summarizeBalances(rows),
        open: rows.filter((o) => outstandingKobo(o) > 0).map((o) => ({ ...o, outstandingKobo: outstandingKobo(o) })),
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }

  async memberBalances(filter: ObligationFilter): Promise<MemberBalance[]> {
    const [obligations, members] = await Promise.all([
      this.uow.read.obligations.listWithAllocations(filter),
      this.uow.read.members.list({}, { page: 1, pageSize: 100_000 }),
    ]);
    return members.rows
      .map((m) => ({
        memberId: m.id,
        memberNo: m.memberNo,
        fullName: m.fullName,
        ...summarizeBalances(obligations.filter((o) => o.memberId === m.id)),
      }))
      .filter((b) => b.dueKobo > 0);
  }

  async totalBalance(filter: ObligationFilter): Promise<BalanceSummary> {
    return summarizeBalances(await this.uow.read.obligations.listWithAllocations(filter));
  }

  /** Charges grouped by category and period, for the Charges page. */
  async chargeSummary(year: number): Promise<ChargeSummary[]> {
    const obligations = await this.uow.read.obligations.listWithAllocations({ year });
    const groups = new Map<string, ObligationRecord[]>();
    for (const o of obligations) {
      const key = `${o.categoryId}|${o.periodKey}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    return [...groups.values()]
      .map((rows) => ({
        categoryId: rows[0].categoryId,
        categoryName: rows[0].categoryName,
        periodKey: rows[0].periodKey,
        label: rows[0].label,
        source: rows[0].source,
        members: rows.length,
        ...summarizeBalances(rows),
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.periodKey.localeCompare(b.periodKey));
  }
}
