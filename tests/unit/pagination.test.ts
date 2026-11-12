import { describe, expect, it } from "vitest";
import { paginate } from "@/lib/pagination";
import { pageFromParams } from "@/lib/validation/query";

describe("paginate", () => {
  const rows = Array.from({ length: 53 }, (_, i) => i + 1);

  it("returns the requested page with the total", () => {
    expect(paginate(rows, { page: 2, pageSize: 25 })).toEqual({ rows: rows.slice(25, 50), total: 53, page: 2, pageSize: 25 });
    expect(paginate(rows, { page: 3, pageSize: 25 }).rows).toEqual([51, 52, 53]);
  });

  it("clamps pages outside the range", () => {
    expect(paginate(rows, { page: 9, pageSize: 25 }).page).toBe(3);
    expect(paginate(rows, { page: 0, pageSize: 25 }).page).toBe(1);
    expect(paginate([], { page: 4, pageSize: 25 })).toEqual({ rows: [], total: 0, page: 1, pageSize: 25 });
  });
});

describe("pageFromParams (page number and rows per page from the URL)", () => {
  it("reads the chosen size and falls back to the default for sizes not offered", () => {
    expect(pageFromParams({ page: "3", pageSize: "100" })).toEqual({ page: 3, pageSize: 100 });
    expect(pageFromParams({ pageSize: "7" }, 50)).toEqual({ page: 1, pageSize: 50 });
    expect(pageFromParams({ page: "-1", pageSize: "abc" })).toEqual({ page: 1, pageSize: 25 });
  });

  it("keeps separate tables on one page independent", () => {
    const params = { historyPage: "2", historyPageSize: "10", page: "5" };
    expect(pageFromParams(params, 25, "historyPage")).toEqual({ page: 2, pageSize: 10 });
    expect(pageFromParams(params, 25, "activePage")).toEqual({ page: 1, pageSize: 25 });
  });
});
