import { expect, test } from "@playwright/test";

const csvBuffer = (content: string) => ({
  name: "import.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(content, "utf8"),
});

test("contacts CSV import previews, flags duplicates, and skips them (FR-3.4)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const existingName = `Existing Contact ${stamp}`;
  const existingEmail = `existing-${stamp}@example.com`;

  // Seed one contact so the CSV's second row is an exact duplicate.
  await page.goto("/contacts/new");
  await page.getByLabel("Name *").fill(existingName);
  await page.getByLabel("Email").fill(existingEmail);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: existingName })).toBeVisible();

  const csv = [
    "Name,Email,Company",
    `Fresh Contact ${stamp},fresh-${stamp}@example.com,Import Co ${stamp}`,
    `Dupe Contact ${stamp},${existingEmail},Import Co ${stamp}`,
  ].join("\n");

  await page.goto("/settings/import");
  await page.getByLabel("CSV file").setInputFiles(csvBuffer(csv));

  // Preview shows mapped columns, the row count, and the duplicate flag.
  await expect(page.getByText("2 rows in the file")).toBeVisible();
  await expect(page.getByText(`Duplicate of ${existingName}`)).toBeVisible();

  await page.getByRole("button", { name: "Import 2 contacts" }).click();
  await expect(
    page.getByText("1 contacts imported, 1 skipped as duplicates.")
  ).toBeVisible();

  await page.goto("/contacts");
  await expect(page.getByText(`Fresh Contact ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Dupe Contact ${stamp}`)).toHaveCount(0);
});

test("deals CSV import places open deals in their mapped stages (FR-3.4)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;

  const csv = [
    "Deal,Client,Value,Stage,Owner",
    `Import Deal A ${stamp},Import Brand ${stamp},15000,Qualified,jess@blu.builders`,
    `Import Deal B ${stamp},Import Brand ${stamp},22000,Negotiation,kurt@blu.builders`,
  ].join("\n");

  await page.goto("/settings/import");
  await page.getByLabel("What are you importing?").selectOption("deals");
  await page.getByLabel("CSV file").setInputFiles(csvBuffer(csv));
  await expect(page.getByText("2 rows in the file")).toBeVisible();

  await page.getByRole("button", { name: "Import 2 deals" }).click();
  await expect(page.getByText("2 deals imported.")).toBeVisible();

  await page.goto("/pipeline");
  await expect(
    page
      .locator('section[aria-label="Qualified"]')
      .getByRole("heading", { name: `Import Deal A ${stamp}` })
  ).toBeVisible();
  await expect(
    page
      .locator('section[aria-label="Negotiation"]')
      .getByRole("heading", { name: `Import Deal B ${stamp}` })
  ).toBeVisible();
});
