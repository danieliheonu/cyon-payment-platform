import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

/** Opaque random token for cookies and guest status links (only its hash is stored). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alike characters

/** Short, hard-to-guess slug for public payment links. */
export function randomSlug(length = 10): string {
  return Array.from({ length }, () => SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)]).join("");
}

/** Temporary password given to new accounts; users must change it at first sign-in. */
export function temporaryPassword(): string {
  return `${randomSlug(4)}-${randomSlug(4)}-${randomSlug(4)}`;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export const bcryptHasher: PasswordHasher = {
  hash: (password) => bcrypt.hash(password, 12),
  verify: (password, hash) => bcrypt.compare(password, hash),
};
