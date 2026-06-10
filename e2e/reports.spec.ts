import { expect, test } from "@playwright/test";

const quickAddDeal = async (
  page: import("@playwright/test").Page,
  companyName: string,
  valueDollars: string
) => {
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 123 456");
  await page.getByLabel("Value guess (AUD)").fill(valueDollars);
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");
};

test("reports dashboard shows pipeline, forecast, and stage breakdown", async ({
  page,
}, testInfo) => {
  const companyName = `Report Co ${testInfo.project.name} ${Date.now()}`;
  await quickAddDeal(page, companyName, "10000");

  await page.goto("/reports");
  const pipeline = page.locator('section[aria-label="Pipeline overview"]');
  await expect(
    pipeline.getByText("Open pipeline", { exact: false })
  ).toBeVisible();
  await expect(
    pipeline.getByText("Weighted forecast", { exact: false })
  ).toBeVisible();
  await expect(
    pipeline.getByText("Lead Captured", { exact: true })
  ).toBeVisible();
  await expect(
    pipeline.getByText("Win rate, last 30 days", { exact: false })
  ).toBeVisible();
});

test("won and lost deals land in the weekly Monday report (FR-8.2)", async ({
  page,
  context,
}, testInfo) => {
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  const wonCompany = `Weekly Won ${stamp}`;
  const lostCompany = `Weekly Lost ${stamp}`;

  // Create both deals first; stage moves trigger router refreshes that can
  // interrupt a subsequent goto, so navigation happens before any moves.
  await quickAddDeal(page, wonCompany, "20000");
  await quickAddDeal(page, lostCompany, "5000");

  // Win the first with handover flagged.
  await page
    .getByRole("button", { name: `Move ${wonCompany} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Won", exact: true }).click();
  let committed = page.waitForResponse(
    (response) => response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Mark as won" }).click();
  await committed;
  await expect(
    page
      .locator('section[aria-label="Won"]')
      .getByRole("heading", { name: wonCompany })
  ).toBeVisible();

  // Lose the second for timing.
  await page
    .getByRole("button", { name: `Move ${lostCompany} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Lost / Dormant" }).click();
  await page.getByLabel("Reason *").selectOption("timing");
  committed = page.waitForResponse(
    (response) => response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Mark as lost" }).click();
  await committed;
  await expect(
    page
      .locator('section[aria-label="Lost / Dormant"]')
      .getByRole("heading", { name: lostCompany })
  ).toBeVisible();

  // Assert in a fresh page: pending router refreshes on the board page
  // would otherwise interrupt these navigations.
  const reportPage = await context.newPage();
  await reportPage.goto("/reports/weekly");

  const wonSection = reportPage.locator('section[aria-label="Won this week"]');
  const wonRow = wonSection.locator("li").filter({ hasText: wonCompany });
  await expect(wonRow).toBeVisible();
  await expect(wonRow.getByText("$20,000")).toBeVisible();
  await expect(wonRow.getByText("Handover flagged")).toBeVisible();

  const lostSection = reportPage.locator(
    'section[aria-label="Lost this week"]'
  );
  const lostRow = lostSection.locator("li").filter({ hasText: lostCompany });
  await expect(lostRow).toBeVisible();
  await expect(lostRow.getByText("Timing")).toBeVisible();

  // The lost reason also feeds the dashboard breakdown (FR-8.1).
  await reportPage.goto("/reports");
  await expect(
    reportPage
      .locator('section[aria-label="Lost reasons"]')
      .getByText("Timing", { exact: true })
  ).toBeVisible();
});
