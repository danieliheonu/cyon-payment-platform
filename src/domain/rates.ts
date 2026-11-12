import type { Frequency } from "./enums";
import type { Kobo } from "./money";

export interface Rate {
  categoryId: string;
  year: number;
  frequency: Frequency;
  amountKobo: Kobo;
}

/** The rate for a category in a financial year, or null if none was set. */
export function findRate<R extends Rate>(rates: readonly R[], categoryId: string, year: number): R | null {
  return rates.find((rate) => rate.categoryId === categoryId && rate.year === year) ?? null;
}

/** FIXED categories with no rate for `year` — shown as a warning on staff dashboards. */
export function categoriesMissingRate(
  fixedCategoryIds: readonly string[],
  rates: readonly Rate[],
  year: number,
): string[] {
  return fixedCategoryIds.filter((id) => !findRate(rates, id, year));
}
