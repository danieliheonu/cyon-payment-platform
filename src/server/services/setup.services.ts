import "server-only";
import { assertCan, type Actor } from "@/domain/actor";
import { BankAccountUsage, Frequency, Pricing } from "@/domain/enums";
import { NotFoundError, RuleError, ValidationError } from "@/domain/errors";
import { categoriesMissingRate } from "@/domain/rates";
import { Permission } from "@/domain/permissions";
import type {
  BankAccountRecord,
  CategoryRecord,
  FinancialYearRecord,
  RateRecord,
  UnitOfWork,
} from "@/server/ports/repositories";
import type {
  BankAccountInput,
  BroughtForwardInput,
  CategoryInput,
  RateInput,
} from "@/lib/validation/schemas";
import type { DuesGenerator } from "./obligation.service";

/** Payment categories (structure only — amounts live in yearly rates). Admin area. */
export class CategoryService {
  constructor(private readonly uow: UnitOfWork) {}

  list(filter?: { activeOnly?: boolean; pricing?: Pricing }): Promise<CategoryRecord[]> {
    return this.uow.read.categories.list(filter);
  }

  async create(actor: Actor, input: CategoryInput): Promise<CategoryRecord> {
    assertCan(actor, Permission.MANAGE_CATEGORIES);
    return this.uow.run(async (repos) => {
      const category = await repos.categories.create(input);
      await repos.audit.record({ actorId: actor.userId, action: "category.created", entity: "PaymentCategory", entityId: category.id, after: category });
      return category;
    });
  }

  async update(actor: Actor, id: string, input: CategoryInput): Promise<CategoryRecord> {
    assertCan(actor, Permission.MANAGE_CATEGORIES);
    return this.uow.run(async (repos) => {
      const before = await repos.categories.findById(id);
      if (!before) throw new NotFoundError("Category");
      if (before.pricing !== input.pricing && (await repos.rates.listUpToYear(9999)).some((r) => r.categoryId === id)) {
        throw new RuleError("Pricing can't change once rates have been set for this category.");
      }
      const after = await repos.categories.update(id, input);
      await repos.audit.record({ actorId: actor.userId, action: "category.updated", entity: "PaymentCategory", entityId: id, before, after });
      return after;
    });
  }
}

/** Receiving bank accounts. Finance area: LINKS_ACCOUNTS. */
export class BankAccountService {
  constructor(private readonly uow: UnitOfWork) {}

  list(filter?: { usage?: BankAccountUsage; activeOnly?: boolean }): Promise<BankAccountRecord[]> {
    return this.uow.read.bankAccounts.list(filter);
  }

  async create(actor: Actor, input: BankAccountInput): Promise<BankAccountRecord> {
    assertCan(actor, Permission.MANAGE_BANK_ACCOUNTS);
    return this.uow.run(async (repos) => {
      const account = await repos.bankAccounts.create(input);
      await repos.audit.record({ actorId: actor.userId, action: "bank_account.created", entity: "BankAccount", entityId: account.id, after: account });
      return account;
    });
  }

  async update(actor: Actor, id: string, input: BankAccountInput): Promise<BankAccountRecord> {
    assertCan(actor, Permission.MANAGE_BANK_ACCOUNTS);
    return this.uow.run(async (repos) => {
      const before = await repos.bankAccounts.findById(id);
      if (!before) throw new NotFoundError("Bank account");
      const after = await repos.bankAccounts.update(id, input);
      await repos.audit.record({ actorId: actor.userId, action: "bank_account.updated", entity: "BankAccount", entityId: id, before, after });
      return after;
    });
  }
}

/**
 * Yearly amounts and frequency per FIXED category. Finance area: RATES_CHARGES.
 * Changing an amount re-prices only that year's completely unpaid automatic dues.
 */
export class RateService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly dues: DuesGenerator,
  ) {}

  listForYear(year: number): Promise<RateRecord[]> {
    return this.uow.read.rates.listForYear(year);
  }

  /** FIXED categories without a rate for `year` (dashboard warning). */
  async missingRates(year: number): Promise<CategoryRecord[]> {
    const [categories, rates] = await Promise.all([
      this.uow.read.categories.list({ activeOnly: true, pricing: Pricing.FIXED }),
      this.uow.read.rates.listForYear(year),
    ]);
    const missing = categoriesMissingRate(categories.map((c) => c.id), rates, year);
    return categories.filter((c) => missing.includes(c.id));
  }

  async setRate(actor: Actor, input: RateInput): Promise<{ rate: RateRecord; repriced: number }> {
    assertCan(actor, Permission.MANAGE_RATES);
    const result = await this.uow.run(async (repos) => {
      const category = await repos.categories.findById(input.categoryId);
      if (!category) throw new NotFoundError("Category");
      if (category.pricing !== Pricing.FIXED) throw new RuleError("Only fixed-amount categories have rates.");

      const existing = await repos.rates.find(input.categoryId, input.year);
      if (existing && existing.frequency !== input.frequency && (await repos.obligations.countAuto(input.categoryId, input.year)) > 0) {
        throw new RuleError(
          `Dues for ${input.year} have already been generated ${existing.frequency.toLowerCase()}. The frequency for ${input.year} can't change; set a new frequency from next year.`,
        );
      }
      if (existing && existing.amountKobo !== input.amount && !input.reason) {
        throw new ValidationError("Give a reason for changing this rate.", { reason: "Required when changing an existing rate." });
      }

      const rate = await repos.rates.upsert({
        categoryId: input.categoryId,
        year: input.year,
        frequency: input.frequency,
        amountKobo: input.amount,
        note: input.note,
        setById: actor.userId,
      });
      const repriced =
        existing && existing.amountKobo !== input.amount
          ? await repos.obligations.repriceUnpaidAuto(input.categoryId, input.year, input.amount)
          : 0;
      await repos.audit.record({
        actorId: actor.userId,
        action: existing ? "rate.updated" : "rate.created",
        entity: "CategoryRate",
        entityId: rate.id,
        before: existing ? { frequency: existing.frequency, amountKobo: existing.amountKobo } : undefined,
        after: { category: category.name, year: input.year, frequency: input.frequency, amountKobo: input.amount, repriced },
        reason: input.reason ?? null,
      });
      return { rate, repriced };
    });
    if (result.rate.frequency !== Frequency.ONE_OFF) await this.dues.generateDue({ categoryId: input.categoryId });
    return result;
  }

  /** Copies last year's rates into `year` for categories that have none yet. */
  async copyFromPreviousYear(actor: Actor, year: number): Promise<number> {
    assertCan(actor, Permission.MANAGE_RATES);
    const [previous, current] = await Promise.all([this.listForYear(year - 1), this.listForYear(year)]);
    const toCopy = previous.filter((p) => !current.some((c) => c.categoryId === p.categoryId));
    for (const rate of toCopy) {
      await this.setRate(actor, {
        categoryId: rate.categoryId,
        year,
        frequency: rate.frequency,
        amount: rate.amountKobo,
        note: `Copied from ${year - 1}`,
        reason: undefined,
      });
    }
    return toCopy.length;
  }
}

/** CYON's fund balance brought forward each year. Finance area: BROUGHT_FORWARD. */
export class FinancialYearService {
  constructor(private readonly uow: UnitOfWork) {}

  list(): Promise<FinancialYearRecord[]> {
    return this.uow.read.financialYears.list();
  }

  find(year: number): Promise<FinancialYearRecord | null> {
    return this.uow.read.financialYears.find(year);
  }

  async setBroughtForward(actor: Actor, input: BroughtForwardInput): Promise<FinancialYearRecord> {
    assertCan(actor, Permission.MANAGE_BROUGHT_FORWARD);
    return this.uow.run(async (repos) => {
      const existing = await repos.financialYears.find(input.year);
      if (existing && !input.reason) {
        throw new ValidationError("Give a reason for changing the brought-forward amount.", {
          reason: "Required when changing a recorded amount.",
        });
      }
      const saved = await repos.financialYears.upsert({
        year: input.year,
        broughtForwardKobo: input.amount,
        note: input.note,
        recordedById: actor.userId,
      });
      await repos.audit.record({
        actorId: actor.userId,
        action: existing ? "brought_forward.updated" : "brought_forward.recorded",
        entity: "FinancialYear",
        entityId: saved.id,
        before: existing ? { broughtForwardKobo: existing.broughtForwardKobo, note: existing.note } : undefined,
        after: { year: input.year, broughtForwardKobo: input.amount, note: input.note },
        reason: input.reason ?? null,
      });
      return saved;
    });
  }
}
