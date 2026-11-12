import "dotenv/config";
import type { ZodType } from "zod";
import { DomainError } from "@/domain/errors";

/** Shared helpers for command-line scripts (validation, friendly errors). */
export function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Validates input, printing each problem (never the values, which may be secrets). */
export function parseOrExit<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) console.error(`  ✗ ${issue.path.join(".") || "input"}: ${issue.message}`);
  process.exit(1);
}

export async function run(main: () => Promise<void>): Promise<void> {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof DomainError ? `✗ ${error.message}` : error);
    process.exit(1);
  }
}
