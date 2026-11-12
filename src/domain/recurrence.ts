import type { DateOnly } from "@/lib/dates";
import { Frequency } from "./enums";
import { monthPeriod, quarterPeriod, yearPeriod, type Period } from "./periods";

/**
 * Strategy per frequency (Open/Closed: a new frequency = a new strategy + one
 * registry entry; ObligationService does not change).
 */
export interface RecurrenceStrategy {
  readonly frequency: Frequency;
  /** All periods of the financial year (Jan–Dec). Empty for one-time charges. */
  periodsInYear(year: number): Period[];
}

const monthly: RecurrenceStrategy = {
  frequency: Frequency.MONTHLY,
  periodsInYear: (year) => Array.from({ length: 12 }, (_, i) => monthPeriod(year, i + 1)),
};

const quarterly: RecurrenceStrategy = {
  frequency: Frequency.QUARTERLY,
  periodsInYear: (year) => Array.from({ length: 4 }, (_, i) => quarterPeriod(year, i + 1)),
};

const yearly: RecurrenceStrategy = {
  frequency: Frequency.YEARLY,
  periodsInYear: (year) => [yearPeriod(year)],
};

/** One-time charges are applied by finance staff, never generated automatically. */
const oneOff: RecurrenceStrategy = {
  frequency: Frequency.ONE_OFF,
  periodsInYear: () => [],
};

const REGISTRY: Record<Frequency, RecurrenceStrategy> = {
  MONTHLY: monthly,
  QUARTERLY: quarterly,
  YEARLY: yearly,
  ONE_OFF: oneOff,
};

export function recurrenceFor(frequency: Frequency): RecurrenceStrategy {
  return REGISTRY[frequency];
}

/**
 * Periods a member owes in `year`: periods that have started by `asOf` and that end
 * on or after the date the member became liable (join date / category start).
 * A member who joins mid-period owes that period.
 */
export function duePeriods(
  frequency: Frequency,
  year: number,
  liableFrom: DateOnly,
  asOf: DateOnly,
): Period[] {
  return recurrenceFor(frequency)
    .periodsInYear(year)
    .filter((period) => period.end >= liableFrom && period.start <= asOf);
}
