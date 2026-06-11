import { expect, type Page, test } from "@playwright/test";

// Filling before React hydrates leaves the client-side filter unapplied:
// the DOM input holds the text, React's value tracker initialises to it on
// hydration, and a repeat fill with the same text is deduped as no change.
// Clearing first forces a real change event each attempt; retry until the
// filter visibly engages. A unique person-name query never matches a
// company, which makes the empty-companies message a reliable signal.
const fillContactsSearch = async (page: Page, query: string) => {
  const search = page.getByLabel("Search contacts");
  await expect(async () => {
    await search.fill("");
    await search.fill(query);
    await expect(
      page.getByText("No companies match your search.")
    ).toBeVisible({ timeout: 1000 });
  }).toPass();
};

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

  // The aggregated view also rolls up quotes (FR-2.2); none exist yet.
  await expect(
    page.locator('section[aria-label="Quotes"]').getByText("No quotes yet.")
  ).toBeVisible();
});

test("contacts search narrows people instantly", async ({ page }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const alphaName = `Alpha Person ${stamp}`;
  const betaName = `Beta Person ${stamp}`;

  for (const name of [alphaName, betaName]) {
    await page.goto("/contacts/new");
    await page.getByLabel("Name *").fill(name);
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  await page.goto("/contacts");
  await fillContactsSearch(page, alphaName);
  await expect(page.getByText(alphaName, { exact: true })).toBeVisible();
  await expect(page.getByText(betaName, { exact: true })).toBeHidden();
});

test("a contact can be edited and then archived", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const contactName = `Edit Target ${stamp}`;
  const newTitle = `Site Manager ${stamp}`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(contactName);
  // No shared email/phone: an exact match would trip the duplicate warning
  // when the three browser projects run this test in parallel (FR-2.3).
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit contact" })
  ).toBeVisible();
  await page.getByLabel("Role / title").fill(newTitle);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  await expect(page.getByText(newTitle).first()).toBeVisible();

  // Archiving is a soft delete: gone from lists, history preserved.
  await page.getByRole("button", { name: "Archive contact" }).click();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await page.waitForURL("**/contacts");
  await fillContactsSearch(page, contactName);
  await expect(page.getByText(contactName, { exact: true })).toBeHidden();
});

test("a company page rolls up its people and deals (FR-2.1)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Companyview Co ${stamp}`;
  const contactName = `Companyview Person ${stamp}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Contact name").fill(contactName);
  await page.getByLabel("Email").fill(`companyview-${stamp}@example.com`);
  await page.getByLabel("Value guess (AUD)").fill("12000");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page.goto("/contacts");
  await page
    .locator('section[aria-label="Companies"]')
    .getByRole("link", { name: new RegExp(companyName) })
    .click();

  await expect(page.getByRole("heading", { name: companyName })).toBeVisible();
  await expect(page.getByText("Open pipeline")).toBeVisible();
  await expect(
    page
      .locator('section[aria-label="People"]')
      .getByText(contactName, { exact: true })
  ).toBeVisible();
  const dealsSection = page.locator('section[aria-label="Deals"]');
  await expect(dealsSection.getByText("Lead Captured")).toBeVisible();
  await expect(dealsSection.getByText("$12,000")).toBeVisible();
});
