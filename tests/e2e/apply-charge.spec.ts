import { devices, expect, test } from "@playwright/test";
import { cspViolations, signIn } from "./helpers";

test.afterEach(() => {
  expect(cspViolations, "the Content-Security-Policy blocked something").toEqual([]);
});

test("on a phone, the officer applies a levy to members ticked from a searchable list", async ({ browser }) => {
  const officer = await signIn(browser, "officer@cyon.test");
  await officer.setViewportSize(devices["iPhone 13"].viewport);
  await officer.goto("/staff/charges");

  await officer.getByLabel("Levy / event category").selectOption({ label: "Development levy" });
  await officer.getByLabel("Event or levy name (optional)").fill("Retreat");
  await officer.getByLabel("Amount (₦, optional)").fill("1500");

  // The member list only appears for "Only selected members".
  await expect(officer.getByRole("checkbox", { name: /Adaeze Nwosu/ })).toHaveCount(0);
  await officer.getByLabel("Only selected members").check();

  const search = officer.getByLabel("Search members");
  await search.fill("adaeze");
  await officer.getByRole("checkbox", { name: /Adaeze Nwosu/ }).check();
  await search.fill("blessing");
  await expect(officer.getByRole("checkbox", { name: /Adaeze Nwosu/ })).toBeHidden();
  await officer.getByRole("checkbox", { name: /Blessing Okon/ }).check();
  await search.fill("");
  await expect(officer.getByText(/^2 of \d+ selected$/)).toBeVisible();

  // Ticked members hidden by the search are still submitted.
  await search.fill("blessing");
  await officer.getByRole("button", { name: "Apply charge" }).click();
  await expect(officer.getByText("Charge applied to 2 members.")).toBeVisible();
});
