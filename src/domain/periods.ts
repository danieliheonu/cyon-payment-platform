import type { DateOnly } from "@/lib/dates";

/**
 * A billing period. Keys are sortable strings:
 *   monthly   2026-03
 *   quarterly 2026-Q1
 *   yearly    2026
 * Event/levy charges may use any other key (e.g. "2026-harvest-dinner").
 */
export interface Period {
  key: string;
  label: string;
  start: DateOnly;
  end: DateOnly;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthPeriod(year: number, month: number): Period {
  return {
    key: `${year}-${pad(month)}`,
    label: `${MONTHS[month - 1]} ${year}`,
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
  };
}

export function quarterPeriod(year: number, quarter: number): Period {
  const firstMonth = (quarter - 1) * 3 + 1;
  const lastMonth = firstMonth + 2;
  return {
    key: `${year}-Q${quarter}`,
    label: `Q${quarter} ${year}`,
    start: `${year}-${pad(firstMonth)}-01`,
    end: `${year}-${pad(lastMonth)}-${pad(lastDayOfMonth(year, lastMonth))}`,
  };
}

export function yearPeriod(year: number): Period {
  return { key: String(year), label: String(year), start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Readable label for any period key; unknown keys are returned as-is. */
export function periodLabel(key: string): string {
  let m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) return monthPeriod(Number(m[1]), Number(m[2])).label;
  m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (m) return quarterPeriod(Number(m[1]), Number(m[2])).label;
  return key;
}

/** Turns free text into a period key for event/levy charges: "Harvest Dinner" → "2026-harvest-dinner". */
export function eventPeriodKey(year: number, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug ? `${year}-${slug}` : String(year);
}
