import { expect, test } from "@playwright/test";
import { cspViolations, signIn } from "./helpers";

test.afterEach(() => {
  expect(cspViolations, "the Content-Security-Policy blocked something").toEqual([]);
});

test("tables page through records, and the reader chooses how many rows to see", async ({ browser }) => {
  const admin = await signIn(browser, "superadmin@cyon.test");
  await admin.goto("/admin/audit");
  const nav = admin.getByRole("navigation", { name: "Pagination" });
  const rows = admin.locator("tbody tr");

  await nav.getByLabel("Rows per page").selectOption("10");
  await expect(admin).toHaveURL(/pageSize=10/);
  await expect(rows).toHaveCount(10);
  await expect(nav).toContainText(/Page 1 of \d+/);

  await nav.getByRole("link", { name: "Next" }).click();
  await expect(admin).toHaveURL(/page=2/);
  await expect(admin).toHaveURL(/pageSize=10/);
  await expect(nav).toContainText(/Page 2 of/);
  await expect(nav.getByLabel("Rows per page")).toHaveValue("10");

  await nav.getByLabel("Rows per page").selectOption("100");
  await expect(admin).toHaveURL(/pageSize=100/);
  expect(await rows.count()).toBeGreaterThan(10);

  // Changing a filter applies at once, keeps the chosen size and starts again at page 1.
  await admin.getByLabel("Record type").selectOption("Payment");
  await expect(admin).toHaveURL(/entity=Payment/);
  await expect(admin).toHaveURL(/pageSize=100/);
  await expect(admin).not.toHaveURL(/[?&]page=/);
});

test("search filters as you type, and Clear resets it", async ({ browser }) => {
  const admin = await signIn(browser, "admin@cyon.test");
  await admin.goto("/staff/members");
  const names = admin.locator("tbody tr td:first-child");
  const everyone = await names.count();
  expect(everyone).toBeGreaterThan(1);
  await expect(admin.getByRole("columnheader", { name: "Member no" })).toHaveCount(0);

  await admin.getByRole("searchbox").pressSequentially("blessing", { delay: 30 });
  await expect(admin).toHaveURL(/q=blessing/);
  await expect(names).toHaveText(["Blessing Okon"]);

  await admin.getByRole("button", { name: "Clear" }).click();
  await expect(admin).not.toHaveURL(/q=/);
  await expect(names).toHaveCount(everyone);
  await expect(admin.getByRole("searchbox")).toHaveValue("");
});
