import { expect, test } from "@playwright/test";

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

  // Clear-then-fill retried until the client-side filter engages (the
  // empty-companies message doubles as the "archived" assertion).
  const search = page.getByLabel("Search contacts");
  await expect(async () => {
    await search.fill("");
    await search.fill(companyName);
    await expect(page.getByText("No companies match your search.")).toBeVisible(
      { timeout: 1000 }
    );
  }).toPass();
});
