import "server-only";
import { assertCan, can, type Actor } from "@/domain/actor";
import { BankAccountUsage, LinkStatus } from "@/domain/enums";
import { ConflictError, ForbiddenError, NotFoundError } from "@/domain/errors";
import { assertValidLinkSettings, linkAvailability, type LinkAvailability } from "@/domain/payment-link";
import { Permission } from "@/domain/permissions";
import { dateOnlyToDb } from "@/lib/dates";
import type { PaymentLinkInput } from "@/lib/validation/schemas";
import type { Clock } from "@/server/ports/file-storage";
import type { PaymentLinkRecord, UnitOfWork } from "@/server/ports/repositories";
import { randomSlug } from "@/server/auth/crypto";

/** What a member of the public sees on /p/[slug]. */
export interface PublicLinkView {
  slug: string;
  title: string;
  purpose: string;
  orgName: string;
  bankAccount: { bankName: string; accountName: string; accountNumber: string };
  amountMode: PaymentLinkRecord["amountMode"];
  amountKobo: number | null;
  targetKobo: number | null;
  confirmedTotalKobo: number;
  closesAt: Date | null;
  availability: LinkAvailability;
}

/** One-time collections shared by link. Finance area: LINKS_ACCOUNTS. */
export class PaymentLinkService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly orgName: string,
  ) {}

  async list(actor: Actor): Promise<PaymentLinkRecord[]> {
    assertCan(actor, Permission.VIEW_REPORTS);
    return this.uow.read.paymentLinks.list();
  }

  async get(actor: Actor, id: string): Promise<PaymentLinkRecord> {
    assertCan(actor, Permission.VIEW_REPORTS);
    const link = await this.uow.read.paymentLinks.findById(id);
    if (!link) throw new NotFoundError("Payment link");
    return link;
  }

  availability(link: PaymentLinkRecord): LinkAvailability {
    return linkAvailability(link, this.clock.now(), link.confirmedTotalKobo);
  }

  async publicView(slug: string): Promise<PublicLinkView | null> {
    const link = await this.uow.read.paymentLinks.findBySlug(slug);
    if (!link) return null;
    const { bankName, accountName, accountNumber } = link.bankAccount;
    return {
      slug: link.slug,
      title: link.title,
      purpose: link.purpose,
      orgName: this.orgName,
      bankAccount: { bankName, accountName, accountNumber },
      amountMode: link.amountMode,
      amountKobo: link.amountKobo,
      targetKobo: link.targetKobo,
      confirmedTotalKobo: link.confirmedTotalKobo,
      closesAt: link.closesAt,
      availability: this.availability(link),
    };
  }

  async create(actor: Actor, input: PaymentLinkInput): Promise<PaymentLinkRecord> {
    assertCan(actor, Permission.MANAGE_PAYMENT_LINKS);
    const settings = {
      amountMode: input.amountMode,
      amountKobo: input.amountMode === "OPEN" ? null : input.amount,
      targetKobo: input.target,
    };
    assertValidLinkSettings(settings);
    // Lagos end of day for the closing date.
    const closesAt = input.closesOn ? new Date(dateOnlyToDb(input.closesOn).getTime() + 23 * 3600_000 - 1000) : null;

    return this.uow.run(async (repos) => {
      let bankAccountId = input.bankAccountId;
      if (!bankAccountId) {
        if (!can(actor, Permission.MANAGE_BANK_ACCOUNTS)) throw new ForbiddenError("You can't add bank accounts.");
        const account = await repos.bankAccounts.create({
          bankName: input.newBankName!,
          accountName: input.newAccountName!,
          accountNumber: input.newAccountNumber!,
          usage: BankAccountUsage.LINK_ONLY,
          isActive: true,
          sortOrder: 0,
        });
        await repos.audit.record({ actorId: actor.userId, action: "bank_account.created", entity: "BankAccount", entityId: account.id, after: account });
        bankAccountId = account.id;
      } else if (!(await repos.bankAccounts.findById(bankAccountId))?.isActive) {
        throw new NotFoundError("Bank account");
      }
      if (!(await repos.categories.findById(input.categoryId))) throw new NotFoundError("Category");

      const link = await repos.paymentLinks.create({
        slug: randomSlug(),
        title: input.title,
        purpose: input.purpose,
        categoryId: input.categoryId,
        bankAccountId,
        ...settings,
        closesAt,
        autoCloseOnTarget: input.autoCloseOnTarget && input.target !== null,
        createdById: actor.userId,
      });
      await repos.audit.record({ actorId: actor.userId, action: "payment_link.created", entity: "PaymentLink", entityId: link.id, after: link });
      return link;
    });
  }

  async setStatus(actor: Actor, id: string, status: LinkStatus): Promise<PaymentLinkRecord> {
    assertCan(actor, Permission.MANAGE_PAYMENT_LINKS);
    return this.uow.run(async (repos) => {
      const before = await repos.paymentLinks.findById(id);
      if (!before) throw new NotFoundError("Payment link");
      if (before.status === status) throw new ConflictError(`This link is already ${status.toLowerCase()}.`);
      const after = await repos.paymentLinks.setStatus(id, status, this.clock.now());
      await repos.audit.record({
        actorId: actor.userId,
        action: status === LinkStatus.CLOSED ? "payment_link.closed" : "payment_link.reopened",
        entity: "PaymentLink",
        entityId: id,
        before: { status: before.status },
        after: { status },
      });
      return after;
    });
  }
}
