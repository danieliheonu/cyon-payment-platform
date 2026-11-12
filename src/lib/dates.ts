/**
 * The single date module. CYON operates in Africa/Lagos (UTC+1, no DST).
 *
 * - Calendar dates (payment date, join date) are `DateOnly` strings "YYYY-MM-DD".
 *   They are stored in Postgres `date` columns, which Prisma maps to a JS Date at
 *   UTC midnight — use `dateOnlyToDb` / `dbToDateOnly` at the repository boundary.
 * - Instants (createdAt, confirmedAt) are stored in UTC and displayed in Lagos time.
 */
export const TIME_ZONE = "Africa/Lagos";

export type DateOnly = string; // YYYY-MM-DD

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const lagosDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const displayDate = new Intl.DateTimeFormat("en-NG", {
  timeZone: "UTC", // DateOnly values are UTC midnight
  day: "numeric",
  month: "short",
  year: "numeric",
});

const displayDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function isDateOnly(value: string): value is DateOnly {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** The calendar date in Lagos for an instant (default: now). */
export function toLagosDateOnly(instant: Date = new Date()): DateOnly {
  return lagosDateParts.format(instant); // en-CA formats as YYYY-MM-DD
}

export function yearOf(date: DateOnly): number {
  return Number(date.slice(0, 4));
}

export function monthOf(date: DateOnly): number {
  return Number(date.slice(5, 7));
}

export function dateOnlyToDb(date: DateOnly): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function dbToDateOnly(date: Date): DateOnly {
  return date.toISOString().slice(0, 10);
}

export function maxDateOnly(a: DateOnly, b: DateOnly): DateOnly {
  return a > b ? a : b;
}

/** "11 Nov 2026" */
export function formatDateOnly(date: DateOnly): string {
  return displayDate.format(dateOnlyToDb(date));
}

/** "11 Nov 2026, 14:30" in Lagos time */
export function formatDateTime(instant: Date): string {
  return displayDateTime.format(instant);
}

/** First and last day of a calendar year, for date-range queries. */
export function yearRange(year: number): { from: DateOnly; to: DateOnly } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
