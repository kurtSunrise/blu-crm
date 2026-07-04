import { expect, test } from "@playwright/test";

// Coverage for the reports analytics upgrade: filters, drill-down, trends
// charts, CSV export, and the dashboard/report reconciliation guarantee
// (FR-8.2 AC: report numbers match the dashboard for the same period).

const OPEN_PIPELINE_LINK = /Open pipeline/;
const OWNER_PARAM = /owner=/;
const TREND_CHART_NAME = /new pipeline value/i;
const FORECAST_CHART_NAME = /expected close month/i;
const COHORT_LINE = /deals? in this cohort/;
const LEADING_COUNT = /^(\d+)/;

const quickAddDeal = async (
  page: import("@playwright/test").Page,
  companyName: string,
  valueDollars: string
) => {
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 777 888");
  await page.getByLabel("Value guess min (AUD)").fill(valueDollars);
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");
};

test("dashboard and reports agree on the open pipeline figure (FR-8.2 AC)", async ({
  page,
}) => {
  await page.goto("/reports");
  const reportsFigure = await page
    .locator('section[aria-label="Pipeline overview"]')
    .getByText("Open pipeline")
    .locator("..")
    .locator("span")
    .first()
    .textContent();
  expect(reportsFigure).toBeTruthy();

  await page.goto("/");
  await expect(page.getByText(reportsFigure as string).first()).toBeVisible();
});

test("report figures drill down to the deals behind them", async ({
  page,
}, testInfo) => {
  const companyName = `Drill Co ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName, "17500");

  await page.goto("/reports");
  await page.getByRole("link", { name: OPEN_PIPELINE_LINK }).click();
  await page.waitForURL("**/reports/deals?*");
  await expect(
    page.getByRole("heading", { name: "Open pipeline" })
  ).toBeVisible();

  // Poll for the server write, then click through to the deal page.
  await expect(async () => {
    await page.reload();
    await expect(
      page.getByText(companyName, { exact: false }).first()
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  await page
    .getByRole("link", { name: new RegExp(companyName) })
    .first()
    .click();
  await page.waitForURL("**/deals/**");
});

test("the owner filter excludes deals that belong to nobody", async ({
  page,
}, testInfo) => {
  const companyName = `Owner Filter ${testInfo.project.name} ${Date.now()}`;

  // Quick-add without choosing an owner: the deal is unowned, so ANY owner
  // filter must exclude it — deterministic even on a shared e2e database.
  await quickAddDeal(page, companyName, "9100");

  await page.goto("/reports/deals?open=1");
  await expect(async () => {
    await page.reload();
    await expect(
      page.getByText(companyName, { exact: false }).first()
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  const ownerSelect = page.locator("#report-filter-owner");
  const firstOwner = await ownerSelect
    .locator("option:not([value=''])")
    .first()
    .getAttribute("value");
  expect(firstOwner).toBeTruthy();
  await ownerSelect.selectOption(firstOwner as string);
  await expect(page).toHaveURL(OWNER_PARAM);
  await expect(page.getByText(companyName, { exact: false })).toHaveCount(0);
});

test("a custom date range scopes the won drill-down", async ({
  page,
}, testInfo) => {
  const companyName = `Range Won ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName, "22000");

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

  // Won today, so it shows inside the default window…
  await expect(async () => {
    await page.goto("/reports/deals?outcome=won");
    await expect(
      page.getByText(companyName, { exact: false }).first()
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  // …and not inside a range from years before it closed.
  await page.goto("/reports/deals?outcome=won&from=2020-01-01&to=2020-01-02");
  await expect(page.getByText(companyName, { exact: false })).toHaveCount(0);
});

test("trends page charts render with the created deal counted", async ({
  page,
}, testInfo) => {
  const companyName = `Trend Co ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName, "5000");

  await page.goto("/reports/trends");
  await expect(page.getByRole("heading", { name: "Trends" })).toBeVisible();
  await expect(page.getByRole("img", { name: TREND_CHART_NAME })).toBeVisible();
  await expect(
    page.getByRole("img", { name: FORECAST_CHART_NAME })
  ).toBeVisible();

  // The summary tiles count at least this test's deal.
  const dealsAdded = page
    .getByText("Deals added")
    .locator("..")
    .locator("span")
    .first();
  await expect(async () => {
    await page.reload();
    const text = await dealsAdded.textContent();
    expect(Number(text)).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });

  // The table fallback exists for screen readers / no-hover use.
  await expect(page.getByText("View as table")).toBeVisible();
});

test("funnel report shows conversion steps and time in stage", async ({
  page,
}, testInfo) => {
  const companyName = `Funnel Co ${testInfo.project.name} ${Date.now()}`;

  // A fresh deal moved one stage on guarantees a non-empty cohort with at
  // least one completed stage span, whatever else is in the shared DB.
  await quickAddDeal(page, companyName, "6000");
  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Qualified" }).click();
  await expect(
    page
      .locator('section[aria-label="Qualified"]')
      .getByRole("heading", { name: companyName })
  ).toBeVisible();

  await page.goto("/reports/funnel");
  await expect(page.getByRole("heading", { name: "Funnel" })).toBeVisible();

  const funnelSection = page.locator('section[aria-label="Stage funnel"]');
  await expect(
    funnelSection.getByText("Lead Captured", { exact: false }).first()
  ).toBeVisible();
  await expect(funnelSection.getByText("Won").first()).toBeVisible();

  // Poll until the server write is visible in the cohort count.
  await expect(async () => {
    await page.reload();
    const cohortText = await page.getByText(COHORT_LINE).textContent();
    expect(
      Number(cohortText?.match(LEADING_COUNT)?.[1] ?? "0")
    ).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });

  await expect(
    page.locator('section[aria-label="Time in stage"]')
  ).toBeVisible();
});

test("team report shows quotes, activity, and follow-through", async ({
  page,
}, testInfo) => {
  const companyName = `Team Co ${testInfo.project.name} ${Date.now()}`;

  // A stage move logs an attributed activity, so the signed-in user is
  // guaranteed a row in the activity list whatever else is in the shared DB.
  await quickAddDeal(page, companyName, "4000");
  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Qualified" }).click();
  await expect(
    page
      .locator('section[aria-label="Qualified"]')
      .getByRole("heading", { name: companyName })
  ).toBeVisible();

  await page.goto("/reports/team");
  await expect(
    page.getByRole("heading", { name: "Team", exact: true })
  ).toBeVisible();
  await expect(page.locator('section[aria-label="Quotes"]')).toBeVisible();
  await expect(
    page.locator('section[aria-label="Follow-through"]')
  ).toBeVisible();

  // Poll until the stage-move activity lands in the per-person list.
  const activitySection = page.locator(
    'section[aria-label="Activity by person"]'
  );
  await expect(async () => {
    await page.reload();
    await expect(activitySection.getByText("logged").first()).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
});

test("CSV export returns the pipeline dataset for a signed-in user", async ({
  page,
}) => {
  const response = await page.request.get(
    "/api/reports/export?report=pipeline"
  );
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const body = await response.text();
  expect(body).toContain("Stage,Deals,Value (AUD)");
  expect(body).toContain("Lead Captured");
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("CSV export rejects unauthenticated requests", async ({ page }) => {
    const response = await page.request.get(
      "/api/reports/export?report=pipeline"
    );
    expect(response.status()).toBe(401);
  });
});
