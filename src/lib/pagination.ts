import type { PageRequest, PageResult } from "@/server/ports/repositories";

/** Rows-per-page choices offered under every paginated table. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** URL parameter holding the rows-per-page for a table whose page number is in `pageKey` (page → pageSize). */
export const pageSizeKey = (pageKey: string) => `${pageKey}Size`;

/**
 * Pages a list that is already in memory (computed reports, small admin lists).
 * A page past the end shows the last page, so a stale link never shows an empty table.
 */
export function paginate<T>(rows: readonly T[], request: PageRequest): PageResult<T> {
  const pages = Math.max(1, Math.ceil(rows.length / request.pageSize));
  const page = Math.min(Math.max(1, request.page), pages);
  const start = (page - 1) * request.pageSize;
  return { rows: rows.slice(start, start + request.pageSize), total: rows.length, page, pageSize: request.pageSize };
}
