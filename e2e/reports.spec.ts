import { expect, test } from "@playwright/test";

const WIN_RATE_HEADING = /Win rate/;

const quickAddDeal = async (
  page: import("@playwright/test").Page,
  companyName: string,
  valueDollars: string
) => {
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 777 888");
  await page.getByLabel("Value guess (AUD)").fill(valueDollars);
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");
};

test("reports dashboard shows pipeline overview, forecast, and stage values (FR-8.1)", async ({
  page,
}, testInfo) => {
  const companyName = `Report Co ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName, "10000");

  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true })
  ).toBeVisible();

  const overview = page.locator('section[aria-label="Pipeline overview"]');
  await expect(overview.getByText("Open pipeline")).toBeVisible();
  await expect(overview.getByText("Weighted forecast")).toBeVisible();
  // Quick-added deals land in Lead Captured; its row carries the value.
  await expect(overview.getByText("Lead Captured")).toBeVisible();

  await expect(
    page
      .locator('section[aria-label="Win rate"]')
      .getByRole("heading", { name: WIN_RATE_HEADING })
  ).toBeVisible();
  await expect(
    page.locator('section[aria-label="Activity volume"]')
  ).toBeVisible();
});

test("a deal marked Won appears in the weekly report with its value (FR-8.2)", async ({
  page,
}, testInfo) => {
  const companyName = `Weekly Won ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName, "25000");

  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Won", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const moveCommitted = page.waitForResponse(
    (response) => response.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: "Mark as won" }).click();
  await moveCommitted;

  // The board updates optimistically; poll the report until the server
  // write is visible.
  await expect(async () => {
    await page.goto("/reports/weekly");
    const wonSection = page.locator('section[aria-label="Won this week"]');
    await expect(
      wonSection.getByText(companyName, { exact: false }).first()
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  const wonSection = page.locator('section[aria-label="Won this week"]');
  await expect(wonSection.getByText("$25,000").first()).toBeVisible();
});

test("weekly report lists open deals under their pipeline stage (FR-8.2)", async ({
  page,
}, testInfo) => {
  const companyName = `Weekly Open ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName, "8000");

  await page.goto("/reports/weekly");
  await expect(
    page.getByRole("heading", { name: "Weekly Pipeline Report" })
  ).toBeVisible();

  const pipelineSection = page.locator(
    'section[aria-label="Full pipeline by stage"]'
  );
  await expect(
    pipelineSection.getByText(companyName, { exact: false }).first()
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy report" })).toBeVisible();
});

test("stage weightings are editable and surface on the forecast (FR-8.1)", async ({
  page,
}) => {
  // All projects write the same value, so parallel runs stay consistent.
  await page.goto("/settings");
  await page.getByLabel("Lead Captured (%)").fill("7");
  await page.getByRole("button", { name: "Save weightings" }).click();
  await expect(page.getByText("Weightings saved.")).toBeVisible();

  await page.goto("/reports");
  await expect(
    page
      .locator('section[aria-label="Pipeline overview"]')
      .getByText("at 7%")
      .first()
  ).toBeVisible({ timeout: 10_000 });
});
