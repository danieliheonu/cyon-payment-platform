/**
 * Normalizes contact details so the same person is always stored and matched the
 * same way (login, duplicate accounts, matching guest payers to members).
 */

/**
 * Nigerian numbers in any common form → the local 11-digit form, stored without the country code:
 * 0803 123 4567 / 803 123 4567 / 2348031234567 / +234 803 123 4567 / +234 (0) 803… → 08031234567.
 * Numbers from other countries are rejected (they can't be stored without their code).
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s().-]/g, "");
  const match = /^(?:\+?234)?0?([1-9]\d{9})$/.exec(compact);
  return match ? `0${match[1]}` : null;
}

/** A WhatsApp share link, opened on a chat with `phone` (stored local form) when given. */
export function whatsappShareUrl(text: string, phone?: string | null): string {
  const number = phone && /^0\d{10}$/.test(phone) ? `234${phone.slice(1)}` : "";
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** A login identifier is either an email or a phone number. */
export type LoginIdentifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

export function parseLoginIdentifier(input: string): LoginIdentifier | null {
  if (input.includes("@")) {
    const email = normalizeEmail(input);
    return email ? { kind: "email", value: email } : null;
  }
  const phone = normalizePhone(input);
  return phone ? { kind: "phone", value: phone } : null;
}
