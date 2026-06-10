import { expect, test } from "@playwright/test";

const MS_PER_DAY = 86_400_000;

const awstInputDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

test("a deal with a fixed date inside the window surfaces as closing soon (US-08)", async ({
  page,
}, testInfo) => {
  const companyName = `Closing Co ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 444 555");
  await page
    .getByLabel("Fixed date (install / event)")
    .fill(awstInputDate(new Date(Date.now() + 7 * MS_PER_DAY)));
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page.goto("/tasks");
  await expect(
    page
      .locator('section[aria-label="Closing soon"]')
      .getByText(companyName, { exact: true })
  ).toBeVisible();
});

test("stale deals surface as needing attention; threshold is configurable (US-08)", async ({
  page,
}, testInfo) => {
  const companyName = `Stale Co ${testInfo.project.name} ${Date.now()}`;

  // The stale threshold is admin-configurable (FR-5.3 AC); zero days makes
  // any uncontacted deal stale immediately, which keeps this test honest
  // without ageing data.
  await page.goto("/settings");
  await page.getByLabel("Needs attention after (days)").fill("0");
  await page.getByRole("button", { name: "Save thresholds" }).click();
  await expect(page.getByText("Thresholds saved.")).toBeVisible();

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 555 666");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page.goto("/tasks");
  await expect(
    page
      .locator('section[aria-label="Needs attention"]')
      .getByText(companyName, { exact: true })
  ).toBeVisible();
});
