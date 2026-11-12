import "server-only";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { DomainError } from "@/domain/errors";

import type { ActionState } from "@/lib/action-state";

export type { ActionState };

/**
 * Turns FormData into a plain object. Repeated keys (checkbox groups, multi-selects)
 * become arrays when listed in `arrayKeys`. File inputs are skipped (read separately).
 */
export function formToObject(formData: FormData, arrayKeys: readonly string[] = []): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key).filter((v) => typeof v === "string");
    result[key] = arrayKeys.includes(key) ? values : values[0];
  }
  for (const key of arrayKeys) result[key] ??= [];
  return result;
}

export async function fileFromForm(formData: FormData, name: string): Promise<{ name: string; bytes: Uint8Array } | null> {
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

function firstErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * The single server-action pipeline: validate with the shared schema → run the
 * service call → map domain errors to a form state. Redirects and other Next.js
 * control-flow errors pass through untouched.
 */
export async function handleAction<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  run: (input: z.output<S>) => Promise<ActionState | void>,
  options: { arrayKeys?: readonly string[] } = {},
): Promise<ActionState> {
  const parsed = schema.safeParse(formToObject(formData, options.arrayKeys));
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: firstErrors(parsed.error) };
  }
  try {
    const result = (await run(parsed.data)) ?? { ok: true, message: "Saved." };
    if (result.ok) refresh(); // re-render the current page with the new data
    return result;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DomainError) {
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
    }
    console.error(error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
