import { PaymentMethod, PaymentStatus } from "@/domain/enums";
import { isDateOnly } from "@/lib/dates";
import { PAGE_SIZES, pageSizeKey } from "@/lib/pagination";
import type { PageRequest, PaymentQuery } from "@/server/ports/repositories";

export type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * URL search params → PaymentQuery. Used by every payment list page and the CSV
 * download route, so on-screen filters and exports always match.
 */
export function paymentQueryFromParams(params: SearchParams): PaymentQuery {
  const status = one(params, "status");
  const method = one(params, "method");
  const from = one(params, "from");
  const to = one(params, "to");
  return {
    memberId: one(params, "memberId"),
    categoryId: one(params, "categoryId"),
    paymentLinkId: one(params, "linkId"),
    statuses: status && status in PaymentStatus ? [status as PaymentStatus] : undefined,
    method: method && method in PaymentMethod ? (method as PaymentMethod) : undefined,
    from: from && isDateOnly(from) ? from : undefined,
    to: to && isDateOnly(to) ? to : undefined,
    search: one(params, "q"),
  };
}

/** PaymentQuery → URL params (for CSV links that reproduce the current filters). */
export function paramsFromPaymentQuery(query: PaymentQuery): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | undefined) => value && params.set(key, value);
  set("memberId", query.memberId);
  set("categoryId", query.categoryId);
  set("linkId", query.paymentLinkId);
  set("status", query.statuses?.[0]);
  set("method", query.method);
  set("from", query.from);
  set("to", query.to);
  set("q", query.search);
  return params;
}

/**
 * Reads the page number and rows-per-page from the URL (`page`, `pageSize`).
 * `key` lets one page paginate several tables independently (e.g. `historyPage`, `historyPageSize`).
 * Only the offered sizes are accepted; anything else falls back to `defaultSize`.
 */
export function pageFromParams(params: SearchParams, defaultSize = 25, key = "page"): PageRequest {
  const page = Number(one(params, key) ?? 1);
  const size = Number(one(params, pageSizeKey(key)));
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : defaultSize,
  };
}

export function yearFromParams(params: SearchParams, fallback: number): number {
  const year = Number(one(params, "year"));
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : fallback;
}

export { one as param };
