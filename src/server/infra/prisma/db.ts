import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ConflictError } from "@/domain/errors";
import type { Kobo } from "@/domain/money";
import { dateOnlyToDb, dbToDateOnly, type DateOnly } from "@/lib/dates";
import type { PageRequest, PageResult } from "@/server/ports/repositories";

/** Either the root client or a transaction client; repositories work with both. */
export type Db = PrismaClient | Prisma.TransactionClient;

// ── Boundary conversions (the only place BigInt / Date columns are converted) ──

export function kobo(value: bigint | number | null | undefined): Kobo {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error("Money value exceeds safe integer range");
  return n;
}

export function koboOrNull(value: bigint | null | undefined): Kobo | null {
  return value === null || value === undefined ? null : kobo(value);
}

export function big(value: Kobo): bigint {
  return BigInt(value);
}

export function bigOrNull(value: Kobo | null | undefined): bigint | null {
  return value === null || value === undefined ? null : BigInt(value);
}

export const toDb = dateOnlyToDb;
export const fromDb = dbToDateOnly;

export function toDbOrUndefined(date: DateOnly | undefined): Date | undefined {
  return date ? dateOnlyToDb(date) : undefined;
}

/** JSON-safe copy for audit/snapshot columns (Dates → ISO strings, drops undefined). */
export function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}

export function paging({ page, pageSize }: PageRequest): { skip: number; take: number } {
  return { skip: (Math.max(1, page) - 1) * pageSize, take: pageSize };
}

export function pageResult<T>(rows: T[], total: number, page: PageRequest): PageResult<T> {
  return { rows, total, page: page.page, pageSize: page.pageSize };
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Runs a write and turns a unique-constraint violation into a ConflictError with a readable message. */
export async function uniqueOr<T>(write: () => Promise<T>, message: string): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(message);
    throw error;
  }
}
