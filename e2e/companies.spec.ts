import { expect, test } from "@playwright/test";
import { fillContactsSearch, resultsStatus } from "./contacts-helpers";

// Companies are first-class records (FR-2.1): editable and archivable
// from their own page, reached via the contact's company link.

test("a company can be edited (FR-2.1)", async ({ page }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Editable Co ${stamp}`;
  const contactName = `Editable Person ${stamp}`;
  const website = `https://example.com/${stamp}`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(contactName);
  await page.getByLabel("Company").fill(companyName);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();

  await page.getByRole("link", { name: companyName }).click();
  await expect(page.getByRole("heading", { name: companyName })).toBeVisible();

  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit company" })
  ).toBeVisible();
  await page.getByLabel("Kind").selectOption("venue");
  await page.getByLabel("Website").fill(website);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { name: companyName })).toBeVisible();
  await expect(page.getByText("venue", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: website })).toBeVisible();
});

test("Add person from a company page prefills the company", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Prefill Co ${stamp}`;
  const firstPerson = `Prefill Person ${stamp}`;
  const secondPerson = `Second Person ${stamp}`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(firstPerson);
  await page.getByLabel("Company").fill(companyName);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: firstPerson })).toBeVisible();

  await page.getByRole("link", { name: companyName }).click();
  await page.getByRole("link", { name: "Add person" }).click();
  await expect(page.getByLabel("Company")).toHaveValue(companyName);

  await page.getByLabel("Name *").fill(secondPerson);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: secondPerson })).toBeVisible();
  await expect(page.getByRole("link", { name: companyName })).toBeVisible();
});

test("the company field suggests existing companies while typing", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Suggest Co ${stamp}`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(`Suggest Seed ${stamp}`);
  await page.getByLabel("Company").fill(companyName);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByRole("heading", { name: `Suggest Seed ${stamp}` })
  ).toBeVisible();

  await page.goto("/contacts/new");
  const field = page.getByLabel("Company");
  // Type a uniquely matching fragment; clear-then-fill retried in case the
  // first events land before hydration.
  const fragment = companyName.slice(0, -2);
  await expect(async () => {
    await field.fill("");
    await field.fill(fragment);
    await expect(page.getByRole("option", { name: companyName })).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  await page.getByRole("option", { name: companyName }).click();
  await expect(field).toHaveValue(companyName);
});

test("quick-add suggests existing clients while typing", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Repeat Client Co ${stamp}`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(`Repeat Seed ${stamp}`);
  await page.getByLabel("Company").fill(companyName);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByRole("heading", { name: `Repeat Seed ${stamp}` })
  ).toBeVisible();

  await page.goto("/deals/new");
  const field = page.getByLabel("Client / brand *");
  const fragment = companyName.slice(0, -2);
  await expect(async () => {
    await field.fill("");
    await field.fill(fragment);
    await expect(page.getByRole("option", { name: companyName })).toBeVisible({
      timeout: 2000,
    });
  }).toPass();
  await page.getByRole("option", { name: companyName }).click();
  await expect(field).toHaveValue(companyName);
});

test("archiving a company removes it from the directory", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Archive Co ${stamp}`;
  const contactName = `Archive Person ${stamp}`;

  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(contactName);
  await page.getByLabel("Company").fill(companyName);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();

  await page.getByRole("link", { name: companyName }).click();
  await expect(page.getByRole("heading", { name: companyName })).toBeVisible();

  await page.getByRole("button", { name: "Archive company" }).click();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await page.waitForURL("**/contacts");

  // The archived company must drop out of the directory: the results status
  // line reports zero company matches for its name.
  await fillContactsSearch(page, companyName);
  await expect(resultsStatus(page)).toContainText("· 0 companies match");
});
