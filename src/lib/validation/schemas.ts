import { z } from "zod";
import {
  AmountMode,
  BankAccountUsage,
  CategoryGroup,
  FinanceArea,
  Frequency,
  MemberStatus,
  Pricing,
  Role,
} from "@/domain/enums";
import {
  amount,
  checkbox,
  dateOnly,
  email,
  enumOf,
  id,
  idempotencyKey,
  optionalAmount,
  optionalDateOnly,
  optionalEmail,
  optionalId,
  optionalPhone,
  optionalText,
  password,
  phone,
  reason,
  text,
  year,
} from "./fields";

/**
 * Every form in the app is validated by one schema here. Server actions parse
 * FormData with these; services receive the typed output.
 */

// ───────────── Auth ─────────────

export const loginSchema = z.object({
  identifier: text("Email or phone number"),
  password: z.string().min(1, "Enter your password."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

// ───────────── Members & users ─────────────

export const memberSchema = z.object({
  fullName: text("Full name"),
  phone,
  email: optionalEmail,
  joinedAt: dateOnly,
  createLogin: checkbox,
});
export type MemberInput = z.infer<typeof memberSchema>;

export const memberUpdateSchema = z.object({
  fullName: text("Full name"),
  phone,
  email: optionalEmail,
  joinedAt: dateOnly,
  status: enumOf(MemberStatus),
});
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;

export const staffUserSchema = z
  .object({
    name: text("Name"),
    email: optionalEmail,
    phone: optionalPhone,
    role: enumOf(Role),
  })
  .refine((v) => v.email || v.phone, { path: ["email"], message: "Enter an email or a phone number." });
export type StaffUserInput = z.infer<typeof staffUserSchema>;

/** First Super Admin, created from SUPER_ADMIN_* environment variables (scripts/bootstrap-super-admin.ts). */
export const bootstrapAdminSchema = z
  .object({ name: text("Name"), email: optionalEmail, phone: optionalPhone, password })
  .refine((v) => v.email || v.phone, { path: ["email"], message: "Enter an email or a phone number." });
export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;

export const changeRoleSchema = z.object({ userId: id, role: enumOf(Role), reason });
export const setActiveSchema = z.object({ userId: id, active: checkbox, reason });

export const grantSchema = z.object({
  userId: id,
  areas: z.array(enumOf(FinanceArea)).min(1, "Tick at least one area."),
  expiresOn: optionalDateOnly,
  reason,
});
export type GrantInput = z.infer<typeof grantSchema>;

export const revokeSchema = z.object({ grantId: id, reason });

// ───────────── Categories, rates, brought forward ─────────────

export const categorySchema = z.object({
  name: text("Name", 120),
  group: enumOf(CategoryGroup),
  pricing: enumOf(Pricing),
  startsOn: dateOnly,
  isActive: checkbox,
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const rateSchema = z.object({
  categoryId: id,
  year,
  frequency: enumOf(Frequency),
  amount,
  note: optionalText(),
  reason: z.preprocess((v) => (v === "" ? undefined : v), reason.optional()),
});
export type RateInput = z.infer<typeof rateSchema>;

export const broughtForwardSchema = z.object({
  year,
  amount: z
    .string()
    .trim()
    .transform((v, ctx) => {
      // Brought forward may legitimately be zero.
      if (/^0+(\.0+)?$/.test(v)) return 0;
      const parsed = amount.safeParse(v);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: "Enter a valid amount, e.g. 250000." });
        return z.NEVER;
      }
      return parsed.data;
    }),
  note: optionalText(),
  reason: z.preprocess((v) => (v === "" ? undefined : v), reason.optional()),
});
export type BroughtForwardInput = z.infer<typeof broughtForwardSchema>;

export const chargeSchema = z.object({
  categoryId: id,
  year,
  name: optionalText(120),
  memberIds: z.array(z.string()).default([]),
  allMembers: checkbox,
  amount: optionalAmount,
});
export type ChargeInput = z.infer<typeof chargeSchema>;

// ───────────── Bank accounts & payment links ─────────────

export const bankAccountSchema = z.object({
  bankName: text("Bank name", 100),
  accountName: text("Account name", 150),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Account number must be 10 digits."),
  usage: enumOf(BankAccountUsage),
  isActive: checkbox,
  sortOrder: z.coerce.number().int().default(0),
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export const paymentLinkSchema = z
  .object({
    title: text("Title", 120),
    purpose: text("Purpose", 500),
    categoryId: id,
    bankAccountId: optionalId,
    newBankName: optionalText(100),
    newAccountName: optionalText(150),
    newAccountNumber: optionalText(10),
    amountMode: enumOf(AmountMode),
    amount: optionalAmount,
    target: optionalAmount,
    closesOn: optionalDateOnly,
    autoCloseOnTarget: checkbox,
  })
  .refine((v) => v.bankAccountId || (v.newBankName && v.newAccountName && v.newAccountNumber), {
    path: ["bankAccountId"],
    message: "Choose an account or enter a new one.",
  })
  .refine((v) => !v.newAccountNumber || /^\d{10}$/.test(v.newAccountNumber), {
    path: ["newAccountNumber"],
    message: "Account number must be 10 digits.",
  });
export type PaymentLinkInput = z.infer<typeof paymentLinkSchema>;

// ───────────── Payments ─────────────

/** Bank transfer details shared by the member and public-link forms. */
const transferFields = {
  amount,
  paidOn: dateOnly,
  senderName: text("Sender's account name", 150),
  senderBank: text("Sender's bank", 100),
  idempotencyKey,
};

export const memberTransferSchema = z.object({
  ...transferFields,
  categoryId: id,
  bankAccountId: id,
  targetObligationId: optionalId,
});
export type MemberTransferInput = z.infer<typeof memberTransferSchema>;

export const guestTransferSchema = z
  .object({
    ...transferFields,
    payerName: text("Your name", 150),
    payerPhone: optionalPhone,
    payerEmail: optionalEmail,
  })
  .refine((v) => v.payerPhone || v.payerEmail, { path: ["payerPhone"], message: "Enter a phone number or email." });
export type GuestTransferInput = z.infer<typeof guestTransferSchema>;

export const cashSchema = z
  .object({
    memberId: optionalId,
    payerName: optionalText(150),
    categoryId: id,
    targetObligationId: optionalId,
    amount,
    paidOn: dateOnly,
    note: optionalText(200),
    idempotencyKey,
  })
  .refine((v) => v.memberId || v.payerName, { path: ["payerName"], message: "Choose a member or enter the payer's name." });
export type CashInput = z.infer<typeof cashSchema>;

export const confirmSchema = z.object({ paymentId: id, linkMemberId: optionalId });
export const rejectSchema = z.object({ paymentId: id, reason });

export const correctionSchema = z.object({
  paymentId: id,
  mode: z.enum(["void", "replace"]),
  amount: optionalAmount,
  paidOn: optionalDateOnly,
  categoryId: optionalId,
  reason,
});
export type CorrectionInput = z.infer<typeof correctionSchema>;

export { email, phone };
