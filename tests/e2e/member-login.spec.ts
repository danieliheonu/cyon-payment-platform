import { expect, test } from "@playwright/test";
import { E2E_MEMBER_DEFAULT_PASSWORD } from "../../playwright.config";
import { cspViolations, newPage, signIn } from "./helpers";

test.afterEach(() => {
  expect(cspViolations, "the Content-Security-Policy blocked something").toEqual([]);
});

test("admin adds a member → copies/shares login details → member signs in with the default password and must change it", async ({ browser }) => {
  const admin = await signIn(browser, "admin@cyon.test");
  await admin.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await admin.goto("/staff/members");
  await admin.getByLabel("Full name").fill("Chioma Eze");
  await admin.getByLabel("Phone number").fill("+234 812 345 6789");
  await admin.getByRole("button", { name: "Add member" }).click();

  // Login details are shown right away, ready to copy or send on WhatsApp.
  const details = admin.locator("pre", { hasText: "Chioma Eze" });
  await expect(details).toContainText("Phone/email: 08123456789");
  await expect(details).toContainText(`Password: ${E2E_MEMBER_DEFAULT_PASSWORD}`);
  await admin.getByRole("button", { name: "Copy login details" }).click();
  expect(await admin.evaluate(() => navigator.clipboard.readText())).toContain(`Password: ${E2E_MEMBER_DEFAULT_PASSWORD}`);
  await expect(admin.getByRole("link", { name: "Share on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/2348123456789\?text=/);

  // The member signs in with the shared details and is made to choose a password.
  const member = await newPage(browser);
  await member.goto("/login");
  await member.getByLabel("Email or phone number").fill("08123456789");
  await member.getByLabel("Password", { exact: true }).fill(E2E_MEMBER_DEFAULT_PASSWORD);
  await member.getByRole("button", { name: "Sign in" }).click();
  await expect(member).toHaveURL(/\/change-password/);
  await member.getByLabel("Current (or temporary) password").fill(E2E_MEMBER_DEFAULT_PASSWORD);
  await member.getByLabel("New password", { exact: true }).fill("Chioma-own-1");
  await member.getByLabel("Confirm new password").fill("Chioma-own-1");
  await member.getByRole("button", { name: "Save password" }).click();
  await expect(member).not.toHaveURL(/\/change-password|\/login/);

  // The default password is no longer shown once the member has their own.
  await admin.goto("/staff/members?q=Chioma");
  await admin.getByRole("link", { name: "Chioma Eze" }).click();
  await expect(admin.getByText("The member has set their own password.")).toBeVisible();
  await expect(admin.locator("pre", { hasText: "Password:" })).toHaveCount(0);

  await admin.getByRole("link", { name: "Back to members" }).click();
  await expect(admin).toHaveURL(/\/staff\/members$/);
});
