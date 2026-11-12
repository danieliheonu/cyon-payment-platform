import { randomBytes } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";

export const PASSWORD = "Cyon-dev-2026";

/** Content-Security-Policy violations seen in any page; the specs assert this stays empty. */
export const cspViolations: string[] = [];

/** A fresh browser context (a separate person/device) that records CSP violations. */
export async function newPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) cspViolations.push(message.text());
  });
  return page;
}

/** Each role gets its own browser context, like separate people on separate phones. */
export async function signIn(browser: Browser, identifier: string): Promise<Page> {
  const page = await newPage(browser);
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

export function proofFile() {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);
  return { name: "transfer.png", mimeType: "image/png", buffer: png };
}

export async function fillTransfer(page: Page, sender: string) {
  await page.getByLabel("Bank you paid from").fill("GTBank");
  await page.getByLabel("Name on the sending account").fill(sender);
  await page.getByLabel("Proof of payment").setInputFiles(proofFile());
}

/** Downloads a receipt link and checks it is a real PDF. */
export async function expectPdf(page: Page, href: string) {
  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");
}
