import { expect, test } from "@playwright/test";

// Mid-pipeline stages are admin-configurable, so the board's exact set is
// data-driven and varies by environment. These three are the stable anchors:
// Lead Captured is the default entry stage, and Won / Lost / Dormant are the
// terminal stages that cannot be removed.
const ANCHOR_STAGE_NAMES = ["Lead Captured", "Won", "Lost / Dormant"];

const RECENT_WINDOW_PATTERN = /last \d+ days/;
const VIEW_ALL_PATTERN = /View all/;
// Anchored to the toggle's "Won {count}" name: a bare /Won/ also matches the
// per-card "Move {deal} to another stage" buttons once a test deal whose name
// contains "Won" sits in the expanded column (strict-mode violation).
const WON_TOGGLE_PATTERN = /^Won \d+$/;

test("pipeline board renders its stage columns", async ({ page }) => {
  await page.goto("/pipeline");
  // Assert the columns by their section rather than a heading: Won and Lost /
  // Dormant render as collapsed summaries whose name sits in a toggle button,
  // not an <h2>.
  for (const name of ANCHOR_STAGE_NAMES) {
    await expect(page.locator(`section[aria-label="${name}"]`)).toBeVisible();
  }
});

test("Won and Lost columns start collapsed and expand on tap", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const won = page.locator('section[aria-label="Won"]');

  // The collapsed column summarises the recent window and links to the full
  // history instead of listing every closed deal.
  await expect(won.getByText(RECENT_WINDOW_PATTERN)).toBeVisible();
  await expect(won.getByRole("link", { name: VIEW_ALL_PATTERN })).toBeVisible();

  const toggle = won.getByRole("button", { name: WON_TOGGLE_PATTERN });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
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

test("quick-add with a value range shows the range on the pipeline card", async ({
  page,
}, testInfo) => {
  const companyName = `E2E-range ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 222 333");
  await page.getByLabel("Value guess min (AUD)").fill("5000");
  await page.getByLabel("Value guess max (AUD)").fill("8000");
  await page.getByRole("button", { name: "Add lead" }).click();

  await page.waitForURL("**/pipeline");
  const card = page.locator("article", {
    has: page.getByRole("heading", { name: companyName }),
  });
  await expect(card).toContainText("$5,000 – $8,000");
});

test("stage change via menu moves the deal and updates totals", async ({
  page,
}, testInfo) => {
  const companyName = `E2E-move ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 111 222");
  await page.getByLabel("Value guess min (AUD)").fill("5000");
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

  // Clicks racing hydration right after navigation can be dropped, so retry
  // until the activity lands (a duplicate log is harmless here). The remote
  // dev DB can hold the server action in flight for several seconds.
  const timeline = page.locator('section[aria-label="Timeline"]');
  await expect(async () => {
    await page.getByRole("button", { name: "Logged a call" }).click();
    await expect(timeline.getByText("Logged a call").first()).toBeVisible({
      timeout: 8000,
    });
  }).toPass({ timeout: 25_000 });
});
