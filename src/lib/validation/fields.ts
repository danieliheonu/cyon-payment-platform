import { z } from "zod";
import { parseNaira } from "@/domain/money";
import { normalizeEmail, normalizePhone } from "@/lib/contact";
import { isDateOnly } from "@/lib/dates";

/**
 * Reusable field schemas. Every form schema in src/lib/validation is built from
 * these, so a rule (e.g. what a valid amount or phone number is) exists once.
 * Inputs arrive as strings from FormData; outputs are domain values.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const text = (label: string, max = 200) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

export const optionalText = (max = 500) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional()).transform((v) => v ?? null);

/** A reason is required for every change to financial or access records (audit trail). */
export const reason = z
  .string({ error: "Give a reason for this change." })
  .trim()
  .min(3, "Give a reason for this change.")
  .max(500);

export const id = z.string().trim().min(1, "Select an option.");

export const optionalId = z.preprocess(blankToUndefined, z.string().trim().optional()).transform((v) => v ?? null);

/** Naira input → kobo. */
export const amount = z
  .string({ error: "Enter an amount." })
  .trim()
  .min(1, "Enter an amount.")
  .transform((value, ctx) => {
    try {
      const kobo = parseNaira(value);
      if (kobo <= 0) throw new Error();
      return kobo;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount, e.g. 5000 or 5000.50." });
      return z.NEVER;
    }
  });

export const optionalAmount = z.preprocess(blankToUndefined, amount.optional()).transform((v) => v ?? null);

export const dateOnly = z
  .string({ error: "Enter a date." })
  .trim()
  .refine(isDateOnly, "Enter a valid date.");

export const optionalDateOnly = z.preprocess(blankToUndefined, dateOnly.optional()).transform((v) => v ?? null);

export const year = z.coerce.number().int().min(2000, "Enter a valid year.").max(2100, "Enter a valid year.");

export const phone = z
  .string({ error: "Enter a phone number." })
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Nigerian phone number, e.g. 0803 123 4567." });
      return z.NEVER;
    }
    return normalized;
  });

export const optionalPhone = z.preprocess(blankToUndefined, phone.optional()).transform((v) => v ?? null);

export const email = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeEmail(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address." });
      return z.NEVER;
    }
    return normalized;
  });

export const optionalEmail = z.preprocess(blankToUndefined, email.optional()).transform((v) => v ?? null);

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Client-generated key that makes double submits harmless. */
export const idempotencyKey = z.string().trim().min(8).max(100);

export const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  // bcrypt only uses the first 72 bytes, so longer passwords would silently be truncated.
  .refine((v) => new TextEncoder().encode(v).length <= 72, "Use at most 72 characters.")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use letters and at least one number.");

export function enumOf<const T extends Record<string, string>>(values: T, message = "Select an option.") {
  return z.enum(Object.values(values) as [T[keyof T], ...T[keyof T][]], { error: message });
}
