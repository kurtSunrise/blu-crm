import { expect, test } from "@playwright/test";

const MONTH_QUERY_PATTERN = /\?month=\d{4}-\d{2}/;

// Server actions and navigations hit the remote dev DB; under parallel
// projects they regularly exceed the default 5s expect timeout.
const SLOW_DB = { timeout: 15_000 };

// Date inputs want YYYY-MM-DD; the app reads dates in the Perth timezone.
const awstInputDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const awstMonthLabel = (date: Date): string =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth",
    month: "long",
    year: "numeric",
  }).format(date);

test("calendar lists fixed dates and follow-ups and links to the deal (US-Calendar)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Calendar Co ${stamp}`;
  const followUpAction = `Confirm install crew ${stamp}`;
  const today = new Date();

  // A deal with a fixed date today, captured through quick add.
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 222 333");
  await page
    .getByLabel("Fixed date (install / event)")
    .fill(awstInputDate(today));
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  // Plus a follow-up due today on the same deal. Clicks racing hydration can
  // be dropped, so retry until the click visibly lands.
  await expect(async () => {
    await page
      .locator('section[aria-label="Lead Captured"]')
      .getByRole("heading", { name: companyName })
      .click();
    await page.waitForURL("**/deals/**", { timeout: 5000 });
  }).toPass(SLOW_DB);
  await page.getByLabel("Next action *").fill(followUpAction);
  await page.getByLabel("Due *").fill(awstInputDate(today));
  await expect(async () => {
    await page.getByRole("button", { name: "Add follow-up" }).click();
    await expect(
      page
        .locator('section[aria-label="Follow-ups"]')
        .getByText(followUpAction)
        .first()
    ).toBeVisible({ timeout: 5000 });
  }).toPass(SLOW_DB);

  // Both show on this month's calendar agenda with the legend explained.
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: awstMonthLabel(today) })
  ).toBeVisible();
  await expect(page.getByLabel("Legend")).toBeVisible();

  const agenda = page.locator('section[aria-label="Agenda"]');
  const fixedDateEvent = agenda
    .getByRole("link")
    .filter({ hasText: companyName })
    .first();
  await expect(fixedDateEvent).toBeVisible();
  await expect(
    agenda.getByRole("link").filter({ hasText: followUpAction }).first()
  ).toBeVisible();

  // Agenda rows link straight to the deal.
  await expect(async () => {
    await fixedDateEvent.click();
    await page.waitForURL("**/deals/**", { timeout: 5000 });
  }).toPass(SLOW_DB);
  await expect(page.getByRole("heading", { name: companyName })).toBeVisible(
    SLOW_DB
  );
});

test("month navigation moves between months and Today returns", async ({
  page,
}) => {
  const now = new Date();
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: awstMonthLabel(now) })
  ).toBeVisible();

  // Clicks racing hydration right after load can be dropped, so retry the
  // click until the URL moves.
  await expect(async () => {
    await page.getByRole("link", { name: "Next month" }).click();
    await expect(page).toHaveURL(MONTH_QUERY_PATTERN, { timeout: 2000 });
  }).toPass(SLOW_DB);
  // Mid-month UTC noon keeps the label in the right Perth month.
  const [year, month] = awstInputDate(now).split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 15, 12));
  await expect(
    page.getByRole("heading", { name: awstMonthLabel(nextMonth) })
  ).toBeVisible(SLOW_DB);

  await expect(async () => {
    await page.getByRole("link", { name: "Current month" }).click();
    await expect(page).not.toHaveURL(MONTH_QUERY_PATTERN, { timeout: 2000 });
  }).toPass(SLOW_DB);
  await expect(
    page.getByRole("heading", { name: awstMonthLabel(now) })
  ).toBeVisible(SLOW_DB);
});
