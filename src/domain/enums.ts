/**
 * Enum values come from prisma/schema.prisma (single source of truth).
 * The generated enums file is plain TypeScript with no database runtime,
 * so it is safe to use in the domain layer and in client components.
 */
export {
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
} from "@/generated/prisma/enums";

import type {
  AmountMode,
  CategoryGroup,
  FinanceArea,
  Frequency,
  PaymentMethod,
  PaymentStatus,
  Role,
} from "@/generated/prisma/enums";

/** Human labels for enums, used by every screen and export. */
export const LABELS = {
  role: {
    MEMBER: "Member",
    FINANCIAL_OFFICER: "Financial Officer",
    ADMIN: "Admin",
    SUPER_ADMIN: "Super Admin",
  } satisfies Record<Role, string>,
  financeArea: {
    PAYMENTS: "Payments (confirm, cash, corrections)",
    RATES_CHARGES: "Rates & charges",
    BROUGHT_FORWARD: "Brought forward",
    LINKS_ACCOUNTS: "Payment links & bank accounts",
  } satisfies Record<FinanceArea, string>,
  categoryGroup: {
    DUES: "Membership dues",
    LEVY: "Levies & contributions",
    EVENT: "Event payments",
    DONATION: "Donations",
  } satisfies Record<CategoryGroup, string>,
  frequency: {
    MONTHLY: "Monthly",
    QUARTERLY: "Quarterly",
    YEARLY: "Yearly",
    ONE_OFF: "One-time",
  } satisfies Record<Frequency, string>,
  paymentMethod: {
    BANK_TRANSFER: "Bank transfer",
    CASH: "Cash",
  } satisfies Record<PaymentMethod, string>,
  paymentStatus: {
    PENDING: "Pending",
    CONFIRMED: "Confirmed",
    REJECTED: "Rejected",
    VOIDED: "Voided (corrected)",
  } satisfies Record<PaymentStatus, string>,
  amountMode: {
    FIXED: "Fixed amount",
    MINIMUM: "Minimum amount",
    OPEN: "Any amount",
  } satisfies Record<AmountMode, string>,
} as const;
