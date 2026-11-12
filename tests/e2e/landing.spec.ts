import { expect, test } from "@playwright/test";

test("the landing page sends signed-out visitors to sign in, even with an expired session cookie", async ({ page, context }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await context.addCookies([{ name: "cyon_session", value: "no-longer-valid", url: page.url() }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
