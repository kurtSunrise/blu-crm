import { expect, test } from "@playwright/test";
import {
  COMPANIES_TOGGLE_NAME,
  fillContactsSearch,
  openCompaniesSection,
} from "./contacts-helpers";

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

test("selecting an existing contact locks phone/email and auto-fills the company", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Linked Co ${stamp}`;
  const secondCompanyName = `Linked Co Two ${stamp}`;
  const contactName = `Linked Contact ${stamp}`;
  const email = `linked-${stamp}@example.com`;

  // Seed an existing contact with a linked company via quick-add.
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Contact name").fill(contactName);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  // Start a second deal and search for the same contact instead of retyping.
  // Clear-then-fill retried until the suggestion appears: WebKit can swallow
  // a fill that lands before hydration (same hardening as companies.spec).
  await page.goto("/deals/new");
  const contactField = page.getByLabel("Contact name");
  await expect(async () => {
    await contactField.fill("");
    await contactField.fill(contactName);
    await expect(
      page.getByRole("option", { name: new RegExp(contactName) })
    ).toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.getByRole("option", { name: new RegExp(contactName) }).click();

  await expect(page.getByLabel("Client / brand *")).toHaveValue(companyName);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expect(page.getByLabel("Phone")).toHaveJSProperty("readOnly", true);
  await expect(page.getByLabel("Email")).toHaveJSProperty("readOnly", true);

  await page.getByRole("button", { name: "Change contact" }).click();
  await expect(page.getByLabel("Email")).toHaveJSProperty("readOnly", false);
  await expect(page.getByLabel("Email")).toHaveValue("");

  // Re-select, edit the auto-filled company (still editable per design), and
  // submit; the deal should link to the existing contact, not a duplicate.
  await expect(async () => {
    await contactField.fill("");
    await contactField.fill(contactName);
    await expect(
      page.getByRole("option", { name: new RegExp(contactName) })
    ).toBeVisible({ timeout: 2000 });
  }).toPass();
  await page.getByRole("option", { name: new RegExp(contactName) }).click();
  await page.getByLabel("Client / brand *").fill(secondCompanyName);
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page.goto("/contacts");
  await page.getByText(contactName).click();
  const dealsSection = page.locator('section[aria-label="Deals"]');
  await expect(dealsSection.getByText(companyName)).toBeVisible();
  await expect(dealsSection.getByText(secondCompanyName)).toBeVisible();
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
  await page.getByLabel("Value guess min (AUD)").fill("12000");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page.goto("/contacts");
  await openCompaniesSection(page);
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

test("open-deals filter narrows to people in the pipeline", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const bareName = `Filter Bare ${stamp}`;
  const dealName = `Filter Dealt ${stamp}`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(bareName);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: bareName })).toBeVisible();

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(`Filter Co ${stamp}`);
  await page.getByLabel("Contact name").fill(dealName);
  // Move focus off the contact combobox so its suggestion dropdown closes
  // and stops overlaying the submit button.
  await page.getByLabel("Email").fill(`filter-${stamp}@example.com`);
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page.goto("/contacts");
  // The search doubles as the hydration gate, so the pill click below lands
  // on a live React tree.
  await fillContactsSearch(page, stamp);
  await expect(page.getByText(bareName, { exact: true })).toBeVisible();
  await expect(page.getByText(dealName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open deals" }).click();
  await expect(page.getByText(bareName, { exact: true })).toBeHidden();
  const dealCard = page.getByRole("listitem").filter({ hasText: dealName });
  await expect(dealCard.getByText(dealName, { exact: true })).toBeVisible();
  // The row carries the deal's stage as a chip.
  await expect(dealCard.getByText("Lead Captured")).toBeVisible();
});

test("a contact row exposes call, text, and email quick actions", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const name = `Quick Actions ${stamp}`;
  // Unique per project run: an exact phone match would trip the duplicate
  // warning when the three browser projects run in parallel.
  const phone = `04${testInfo.project.name.length}${Date.now()
    .toString()
    .slice(-7)}`;
  const email = `quick-actions-${stamp}@example.com`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(name);
  await page.getByLabel("Phone").fill(phone);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.goto("/contacts");
  await fillContactsSearch(page, name);
  await expect(page.getByLabel(`Call ${name}`)).toHaveAttribute(
    "href",
    `tel:${phone}`
  );
  await expect(page.getByLabel(`Text ${name}`)).toHaveAttribute(
    "href",
    `sms:${phone}`
  );
  await expect(page.getByLabel(`Email ${name}`)).toHaveAttribute(
    "href",
    `mailto:${email}`
  );
});

test("recently-contacted sort floats the touched contact", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const quietName = `Sort Quiet ${stamp}`;
  const touchedName = `Sort Touched ${stamp}`;
  const seeds = [
    {
      company: `Sort Co A ${stamp}`,
      email: `sort-a-${stamp}@example.com`,
      name: quietName,
    },
    {
      company: `Sort Co B ${stamp}`,
      email: `sort-b-${stamp}@example.com`,
      name: touchedName,
    },
  ];

  for (const seed of seeds) {
    await page.goto("/deals/new");
    await page.getByLabel("Client / brand *").fill(seed.company);
    await page.getByLabel("Contact name").fill(seed.name);
    // Move focus off the contact combobox so its suggestion dropdown closes
    // and stops overlaying the submit button.
    await page.getByLabel("Email").fill(seed.email);
    await page.getByRole("button", { name: "Add lead" }).click();
    await page.waitForURL("**/pipeline");
  }

  // Quick-log a call on the touched contact's deal; that stamps their
  // last-contacted date.
  await page.goto("/contacts");
  await fillContactsSearch(page, touchedName);
  await page.getByText(touchedName, { exact: true }).click();
  await page
    .locator('section[aria-label="Deals"]')
    .getByRole("link", { name: new RegExp(`Sort Co B ${stamp}`) })
    .click();
  await page.getByRole("button", { name: "Logged a call" }).click();
  // The confirmation toast repeats the button label once the action lands.
  await expect(page.getByText("Logged a call")).toHaveCount(2);

  await page.goto("/contacts");
  await fillContactsSearch(page, stamp);
  const touchedCard = page
    .getByRole("listitem")
    .filter({ hasText: touchedName });
  await expect(touchedCard.getByText("Contacted Today")).toBeVisible();

  await page.getByLabel("Sort people").selectOption("recent");
  const firstCard = page
    .locator('section[aria-label="People"] ul > li')
    .first();
  await expect(firstCard).toContainText(touchedName);
});

test("small screens flip between people and companies sections", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Toggle Co ${stamp}`;
  const contactName = `Toggle Person ${stamp}`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(contactName);
  await page.getByLabel("Company").fill(companyName);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();

  await page.goto("/contacts");
  await fillContactsSearch(page, stamp);
  const peopleSection = page.locator('section[aria-label="People"]');
  const companiesSection = page.locator('section[aria-label="Companies"]');
  const toggle = page.getByRole("button", { name: COMPANIES_TOGGLE_NAME });

  if (await toggle.isVisible()) {
    // Phone and tablet: one section at a time behind the toggle.
    await expect(companiesSection).toBeHidden();
    await openCompaniesSection(page);
    await expect(
      companiesSection.getByText(companyName, { exact: true })
    ).toBeVisible();
    await expect(peopleSection).toBeHidden();
  } else {
    // Desktop: both sections stay side by side.
    await expect(
      peopleSection.getByText(contactName, { exact: true })
    ).toBeVisible();
    await expect(
      companiesSection.getByText(companyName, { exact: true })
    ).toBeVisible();
  }
});
