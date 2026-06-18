import { expect, test } from "@playwright/test";

const EMAIL_INTAKE_STATUS = /Connected|Not configured/;
const THEME_TOGGLE_NAME = /Switch to (light|dark) mode/;
const CSV_IMPORT_LINK = /CSV import/;

test("settings surfaces alerts, forecast, intake, data, appearance and workspace", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // The two admin forms stay front and centre (FR-5.3, FR-8.1).
  await expect(page.getByLabel("Needs attention after (days)")).toBeVisible();
  await expect(page.getByLabel("Lead Captured (%)")).toBeVisible();

  const intake = page.locator('section[aria-label="Lead intake"]');
  await expect(intake.getByText("Public enquiry form")).toBeVisible();
  await expect(intake.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    "/enquire"
  );
  await expect(intake.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect(intake.getByText(EMAIL_INTAKE_STATUS)).toBeVisible();

  await expect(
    page
      .locator('section[aria-label="Appearance"]')
      .getByRole("button", { name: THEME_TOGGLE_NAME })
  ).toBeVisible();

  await expect(
    page
      .locator('section[aria-label="Workspace"]')
      .getByText("Blu.Builders Pty Ltd")
  ).toBeVisible();
});

test("CSV import is reachable from the settings data card (FR-3.4)", async ({
  page,
}) => {
  await page.goto("/settings");
  await page
    .locator('section[aria-label="Data"]')
    .getByRole("link", { name: CSV_IMPORT_LINK })
    .click();
  await page.waitForURL("**/settings/import");
  await expect(page.getByRole("heading", { name: "CSV import" })).toBeVisible();
});

test("AI assistant instructions save and persist across reloads", async ({
  page,
}) => {
  const instructions = `Keep emails short. Lead with the ask. Test ${Date.now()}`;

  await page.goto("/settings/ai");
  const field = page.getByLabel("Instructions");
  await expect(field).toBeVisible();

  await field.fill(instructions);
  await page.getByRole("button", { name: "Save instructions" }).click();
  await expect(page.getByText("Instructions saved.")).toBeVisible();

  // Reload to confirm the value was persisted, not just held in form state.
  await page.reload();
  await expect(page.getByLabel("Instructions")).toHaveValue(instructions);

  // Clearing the field is allowed and reverts the assistant to its defaults.
  await page.getByLabel("Instructions").fill("");
  await page.getByRole("button", { name: "Save instructions" }).click();
  await expect(page.getByText("Instructions saved.")).toBeVisible();
});
