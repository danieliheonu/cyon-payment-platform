import { expect, test } from "@playwright/test";
import { formatDateOnly, toLagosDateOnly } from "../../src/lib/dates";
import { cspViolations, expectPdf, fillTransfer, newPage, signIn } from "./helpers";

const today = formatDateOnly(toLagosDateOnly());

test.afterEach(() => {
  expect(cspViolations, "the Content-Security-Policy blocked something").toEqual([]);
});

test("member pays with proof → officer confirms → right category, member and date → receipt downloads", async ({ browser }) => {
  const member = await signIn(browser, "member@cyon.test");
  await member.goto("/pay");
  await member.getByLabel("Payment category").selectOption({ label: (await member.locator("option", { hasText: "Monthly dues" }).first().textContent())! });
  await member.getByLabel("Amount (₦)").fill("500");
  await expect(member.getByLabel("Transfer reference / session ID")).toHaveCount(0);
  await fillTransfer(member, "Adaeze Nwosu");
  await member.getByRole("button", { name: "Submit payment" }).click();
  await expect(member.getByText("Payment submitted")).toBeVisible();
  await expect(member.getByText("Pending").first()).toBeVisible();
  const paymentUrl = new URL(member.url()).pathname;

  // Pending payments are not receipts yet.
  await expect(member.getByRole("link", { name: "Download receipt" })).toHaveCount(0);

  const officer = await signIn(browser, "officer@cyon.test");
  await officer.goto("/finance/confirmations");
  await expect(officer.getByText("Monthly dues").first()).toBeVisible();
  await officer.goto(paymentUrl);
  await officer.getByRole("button", { name: "Confirm money received" }).click();
  // The receipt link only exists once confirmation (and receipt numbering) has committed.
  await expect(officer.getByRole("link", { name: "Download receipt" })).toBeVisible();
  await officer.getByRole("link", { name: "Back to all payments" }).click();
  await expect(officer).toHaveURL(/\/staff\/payments$/);

  await member.goto("/history");
  const row = member.getByRole("row").filter({ hasText: "₦500.00" }).filter({ hasText: "Monthly dues" });
  await expect(row).toContainText(today);
  await expect(row).toContainText("Confirmed");
  const receiptLink = row.getByRole("link", { name: /^CYON-\d{4}-\d{6}$/ });
  await expectPdf(member, (await receiptLink.getAttribute("href"))!);

  // Another member can't open it.
  const other = await signIn(browser, "blessing@cyon.test");
  await other.goto(paymentUrl);
  await expect(other.getByText("You don't have access to this page")).toBeVisible();
  await expect(other.getByText("E2E-DUES-001")).toHaveCount(0);
});

test("Super Admin grants an Admin payment links → Admin creates a link with a new account → guest pays → officer confirms → guest downloads receipt", async ({ browser }) => {
  // Admins can't create links until granted.
  const admin = await signIn(browser, "admin@cyon.test");
  await admin.goto("/staff/payment-links");
  await expect(admin.getByRole("button", { name: "Create link" })).toHaveCount(0);

  const superAdmin = await signIn(browser, "superadmin@cyon.test");
  await superAdmin.goto("/admin/access");
  await superAdmin.getByLabel("Admin", { exact: true }).selectOption({ label: "Emeka Obi — Admin" });
  await superAdmin.getByLabel("Payment links & bank accounts").check();
  await superAdmin.getByLabel("Reason").fill("Running the harvest collection");
  await superAdmin.getByRole("button", { name: "Grant access" }).click();
  await expect(superAdmin.getByText("Granted 1 area.")).toBeVisible();

  await admin.goto("/staff/payment-links");
  await admin.getByLabel("Title").fill("Harvest thanksgiving");
  await admin.getByLabel("Record under category").selectOption({ label: "Donations" });
  await admin.getByLabel(/^Purpose/).fill("Harvest thanksgiving offering for the youth choir.");
  await admin.getByLabel("Receiving account").selectOption({ value: "" });
  await admin.getByLabel("Bank", { exact: true }).fill("Zenith Bank");
  await admin.getByLabel("Account number").fill("2087654321");
  await admin.getByLabel("Account name").fill("CYON Harvest Committee");
  await admin.getByLabel("Amount", { exact: true }).selectOption({ label: "Fixed amount" });
  await admin.getByLabel("Amount (₦)").fill("2000");
  await admin.getByRole("button", { name: "Create link" }).click();
  await expect(admin).toHaveURL(/\/staff\/payment-links\/[\w-]+$/);
  const shareUrl = (await admin.locator("code").first().textContent())!;
  expect(shareUrl).toMatch(/\/p\/[a-z0-9]+$/);

  // The guest has no account.
  const guest = await newPage(browser);
  await guest.goto(new URL(shareUrl).pathname);
  await expect(guest.getByText("Harvest thanksgiving offering for the youth choir.")).toBeVisible();
  await expect(guest.getByText("2087654321")).toBeVisible();
  await expect(guest.getByLabel("Amount (₦)")).toHaveValue("2000.00");
  await guest.getByLabel("Your full name").fill("Kelechi Guest");
  await guest.getByLabel("Phone number").fill("08170000001");
  await fillTransfer(guest, "Kelechi Guest");
  await guest.getByRole("button", { name: "Submit payment" }).click();
  await expect(guest.getByText("Received — awaiting confirmation")).toBeVisible();
  const statusPath = new URL(guest.url()).pathname;

  const officer = await signIn(browser, "officer@cyon.test");
  await officer.goto("/finance/confirmations");
  await officer.getByRole("row").filter({ hasText: "Kelechi Guest" }).getByRole("link", { name: "View" }).click();
  await officer.getByRole("button", { name: "Confirm money received" }).click();
  // The receipt link only exists once confirmation (and receipt numbering) has committed.
  await expect(officer.getByRole("link", { name: "Download receipt" })).toBeVisible();
  await officer.getByRole("link", { name: "Back to all payments" }).click();
  await expect(officer).toHaveURL(/\/staff\/payments$/);

  await guest.goto(statusPath);
  const download = guest.getByRole("link", { name: "Download receipt" });
  await expect(download).toBeVisible();
  await expectPdf(guest, (await download.getAttribute("href"))!);
  await guest.getByRole("link", { name: "Back to the payment page" }).click();
  await expect(guest.getByRole("button", { name: "Submit payment" })).toBeVisible();
});
