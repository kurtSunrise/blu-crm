import { expect, test } from "@playwright/test";

const MS_PER_DAY = 86_400_000;

// Date inputs want YYYY-MM-DD; the app reads dates in the Perth timezone.
const awstInputDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const quickAddDeal = async (
  page: import("@playwright/test").Page,
  companyName: string
) => {
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 222 333");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");
};

test("follow-ups land on the deal and the daily task list, overdue first (US-07)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `FollowUp Co ${stamp}`;
  const overdueAction = `Chase quote ${stamp}`;
  const todayAction = `Book site visit ${stamp}`;

  await quickAddDeal(page, companyName);
  await page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName })
    .click();

  const followUps = page.locator('section[aria-label="Follow-ups"]');
  await expect(followUps.getByText("No next action set")).toBeVisible();

  // One follow-up due yesterday (overdue), one due today.
  await page.getByLabel("Next action *").fill(overdueAction);
  await page
    .getByLabel("Due *")
    .fill(awstInputDate(new Date(Date.now() - MS_PER_DAY)));
  await page.getByRole("button", { name: "Add follow-up" }).click();
  await expect(followUps.getByText(overdueAction)).toBeVisible();

  await page.getByLabel("Next action *").fill(todayAction);
  await page.getByLabel("Due *").fill(awstInputDate(new Date()));
  await page.getByRole("button", { name: "Add follow-up" }).click();
  await expect(followUps.getByText(todayAction)).toBeVisible();

  // The daily list buckets them, overdue marked and listed first (FR-5.2).
  await page.goto("/tasks");
  const overdueSection = page.locator('section[aria-label="Overdue"]');
  const todaySection = page.locator('section[aria-label="Today"]');
  const overdueItem = overdueSection
    .locator("li")
    .filter({ hasText: overdueAction });
  await expect(overdueItem).toBeVisible();
  await expect(overdueItem.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(
    todaySection.locator("li").filter({ hasText: todayAction })
  ).toBeVisible();

  // Completing the overdue item clears it from the list.
  await overdueItem
    .getByRole("button", { name: `Mark done: ${overdueAction}` })
    .click();
  await expect(overdueItem).toHaveCount(0);
});

test("completing a follow-up records it on the deal timeline", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Timeline Co ${stamp}`;
  const action = `Confirm slab booking ${stamp}`;

  await quickAddDeal(page, companyName);
  await page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName })
    .click();

  const followUps = page.locator('section[aria-label="Follow-ups"]');
  await page.getByLabel("Next action *").fill(action);
  await page.getByLabel("Due *").fill(awstInputDate(new Date()));
  await page.getByRole("button", { name: "Add follow-up" }).click();
  await expect(followUps.getByText(action)).toBeVisible();

  // Completing it drops it from the open list and leaves a timeline trace.
  await followUps.getByRole("button", { name: `Mark done: ${action}` }).click();

  const timeline = page.locator('section[aria-label="Timeline"]');
  await expect(timeline.getByText("Follow-up completed")).toBeVisible();
  await expect(timeline.getByText(action)).toBeVisible();
});

test("an overdue follow-up raises an in-app notification (FR-11.1)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Notify Co ${stamp}`;
  const overdueAction = `Send revised concept ${stamp}`;

  await quickAddDeal(page, companyName);
  await page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName })
    .click();

  await page.getByLabel("Next action *").fill(overdueAction);
  await page
    .getByLabel("Due *")
    .fill(awstInputDate(new Date(Date.now() - 2 * MS_PER_DAY)));
  await page.getByRole("button", { name: "Add follow-up" }).click();
  await expect(
    page.locator('section[aria-label="Follow-ups"]').getByText(overdueAction)
  ).toBeVisible();

  await page.goto("/notifications");
  await expect(
    page.locator("li").filter({ hasText: overdueAction }).first()
  ).toBeVisible();
});
