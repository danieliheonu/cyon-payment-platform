"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { formatNaira } from "@/domain/money";
import {
  bankAccountSchema,
  broughtForwardSchema,
  cashSchema,
  chargeSchema,
  confirmSchema,
  correctionSchema,
  paymentLinkSchema,
  rateSchema,
  rejectSchema,
} from "@/lib/validation/schemas";
import { id, year } from "@/lib/validation/fields";
import { services } from "@/server/container";
import { handleAction, type ActionState } from "@/server/http/action";
import { requireActor } from "@/server/auth/session";

// ───────────── PAYMENTS area ─────────────

export async function confirmPaymentAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(confirmSchema, formData, async (input) => {
    const receipt = await services().confirmations.confirm(actor, input.paymentId, { linkMemberId: input.linkMemberId });
    return { ok: true, message: `Confirmed. Receipt ${receipt.receiptNo} issued.` };
  });
}

export async function rejectPaymentAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(rejectSchema, formData, async (input) => {
    await services().confirmations.reject(actor, input.paymentId, input.reason);
    return { ok: true, message: "Payment rejected." };
  });
}

export async function recordCashAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let paymentId: string | null = null;
  const result = await handleAction(cashSchema, formData, async (input) => {
    const { payment } = await services().submissions.recordCash(actor, input);
    paymentId = payment.id;
  });
  if (result?.ok && paymentId) redirect(`/payments/${paymentId}`);
  return result;
}

export async function correctPaymentAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let target: string | null = null;
  const result = await handleAction(correctionSchema, formData, async (input) => {
    const replacement = await services().corrections.correct(actor, input);
    target = replacement?.id ?? input.paymentId;
  });
  if (result?.ok && target) redirect(`/payments/${target}`);
  return result;
}

// ───────────── RATES_CHARGES area ─────────────

export async function setRateAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(rateSchema, formData, async (input) => {
    const { rate, repriced } = await services().rates.setRate(actor, input);
    return {
      ok: true,
      message: `${rate.categoryName} ${rate.year}: ${formatNaira(rate.amountKobo)} saved.${repriced ? ` ${repriced} unpaid charges updated.` : ""}`,
    };
  });
}

export async function copyRatesAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(z.object({ year }), formData, async (input) => {
    const copied = await services().rates.copyFromPreviousYear(actor, input.year);
    return { ok: true, message: copied ? `Copied ${copied} rate${copied === 1 ? "" : "s"} from ${input.year - 1}.` : "Nothing to copy." };
  });
}

export async function applyChargeAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(
    chargeSchema,
    formData,
    async (input) => {
      const created = await services().obligations.applyCharge(actor, input);
      return { ok: true, message: created ? `Charge applied to ${created} member${created === 1 ? "" : "s"}.` : "Those members already have this charge." };
    },
    { arrayKeys: ["memberIds"] },
  );
}

// ───────────── BROUGHT_FORWARD area ─────────────

export async function setBroughtForwardAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(broughtForwardSchema, formData, async (input) => {
    await services().financialYears.setBroughtForward(actor, input);
    return { ok: true, message: `Brought forward for ${input.year} saved.` };
  });
}

// ───────────── LINKS_ACCOUNTS area ─────────────

export async function saveBankAccountAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(bankAccountSchema.extend({ accountId: z.string().optional() }), formData, async ({ accountId, ...input }) => {
    if (accountId) await services().bankAccounts.update(actor, accountId, input);
    else await services().bankAccounts.create(actor, input);
    return { ok: true, message: accountId ? "Account updated." : "Account added." };
  });
}

export async function createPaymentLinkAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let linkId: string | null = null;
  const result = await handleAction(paymentLinkSchema, formData, async (input) => {
    linkId = (await services().paymentLinks.create(actor, input)).id;
  });
  if (result?.ok && linkId) redirect(`/staff/payment-links/${linkId}`);
  return result;
}

export async function setLinkStatusAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(z.object({ linkId: id, status: z.enum(["OPEN", "CLOSED"]) }), formData, async (input) => {
    await services().paymentLinks.setStatus(actor, input.linkId, input.status);
    return { ok: true, message: input.status === "CLOSED" ? "Link closed." : "Link reopened." };
  });
}
