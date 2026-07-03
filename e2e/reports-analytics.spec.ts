import { expect, test } from "@playwright/test";

// Coverage for the reports analytics upgrade: filters, drill-down, trends
// charts, CSV export, and the dashboard/report reconciliation guarantee
// (FR-8.2 AC: report numbers match the dashboard for the same period).

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
  await page.getByRole("link", { name: /Open pipeline/ }).click();
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
  await expect(page).toHaveURL(/owner=/);
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
  await expect(
    page.getByRole("img", { name: /new pipeline value/i })
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /expected close month/i })
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
