import { expect, test } from "@playwright/test";

test("duplicate contact warns before creating (US-04)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const email = `dup-${stamp}@example.com`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(`Original ${stamp}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByRole("heading", { name: `Original ${stamp}` })
  ).toBeVisible();

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(`Duplicate ${stamp}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add contact" }).click();

  await expect(
    page.getByText("This looks like an existing contact")
  ).toBeVisible();
  await expect(page.getByText("(exact match)")).toBeVisible();

  await page.getByRole("button", { name: "Create anyway" }).click();
  await expect(
    page.getByRole("heading", { name: `Duplicate ${stamp}` })
  ).toBeVisible();
});

test("contact page rolls up linked deals with their stage (US-17)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Rollup Co ${stamp}`;
  const contactName = `Rollup Contact ${stamp}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Contact name").fill(contactName);
  await page.getByLabel("Email").fill(`rollup-${stamp}@example.com`);
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page.goto("/contacts");
  await page.getByText(contactName).click();

  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  const dealsSection = page.locator('section[aria-label="Deals"]');
  await expect(dealsSection.getByText(companyName)).toBeVisible();
  await expect(dealsSection.getByText("Lead Captured")).toBeVisible();
});
