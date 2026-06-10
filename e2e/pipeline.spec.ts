import { expect, test } from "@playwright/test";

const STAGE_NAMES = [
  "Lead Captured",
  "Qualified",
  "Brief / Site Visit",
  "Concept / Quote Issued",
  "Proposal Review",
  "Negotiation",
  "Won",
  "Lost / Dormant",
];

test("pipeline board shows all eight default stages", async ({ page }) => {
  await page.goto("/pipeline");
  for (const name of STAGE_NAMES) {
    await expect(
      page.getByRole("heading", { name, exact: true })
    ).toBeVisible();
  }
});

test("quick-add captures a lead onto the board", async ({ page }, testInfo) => {
  const companyName = `E2E ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 000 000");
  await page.getByRole("button", { name: "Add lead" }).click();

  await page.waitForURL("**/pipeline");
  const leadCaptured = page.locator('section[aria-label="Lead Captured"]');
  await expect(
    leadCaptured.getByRole("heading", { name: companyName })
  ).toBeVisible();
});

test("stage change via menu moves the deal and updates totals", async ({
  page,
}, testInfo) => {
  const companyName = `E2E-move ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 111 222");
  await page.getByLabel("Value guess (AUD)").fill("5000");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Qualified" }).click();

  const qualified = page.locator('section[aria-label="Qualified"]');
  await expect(
    qualified.getByRole("heading", { name: companyName })
  ).toBeVisible();
  await expect(qualified.locator("header")).toContainText("$");
});

test("deal detail logs a call onto the timeline", async ({
  page,
}, testInfo) => {
  const companyName = `E2E-log ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Email").fill(`log-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName })
    .click();
  await expect(page.getByRole("heading", { name: companyName })).toBeVisible();

  await page.getByRole("button", { name: "Logged a call" }).click();
  const timeline = page.locator('section[aria-label="Timeline"]');
  await expect(timeline.getByText("Logged a call")).toBeVisible();
});
