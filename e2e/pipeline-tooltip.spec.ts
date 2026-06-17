import { expect, type Page, test } from "@playwright/test";

// Date inputs want YYYY-MM-DD, read in the Perth timezone.
const awstInputDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

// SettingsSection renders a plain <section> with no accessible name, so scope
// to it by the heading it contains rather than an aria-label.
const tooltipSection = (page: Page) =>
  page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Pipeline card details",
      exact: true,
    }),
  });

// Save the tooltip preferences with everything on, so the hover preview is
// active regardless of what an earlier run left in app_setting. Writing the
// default (all on) is idempotent, so parallel projects do not clash.
const enableTooltips = async (page: Page) => {
  await page.goto("/settings");
  const section = tooltipSection(page);
  await expect(section).toBeVisible();
  await section.getByLabel("Show deal details on hover").check();
  await section.getByLabel("Scope summary", { exact: true }).check();
  await section
    .getByLabel("Last contact and close date", { exact: true })
    .check();
  await section.getByLabel("Next follow-up", { exact: true }).check();
  await section.getByRole("button", { name: "Save preference" }).click();
  await expect(section.getByText("Preference saved.")).toBeVisible();
};

test("settings exposes the pipeline card tooltip controls", async ({
  page,
}) => {
  await page.goto("/settings");
  const section = tooltipSection(page);
  await expect(section).toBeVisible();
  await expect(section.getByLabel("Show deal details on hover")).toBeVisible();
  await expect(
    section.getByLabel("Scope summary", { exact: true })
  ).toBeVisible();
  await expect(
    section.getByLabel("Next follow-up", { exact: true })
  ).toBeVisible();
  await expect(
    section.getByRole("button", { name: "Save preference" })
  ).toBeVisible();
});

test("hovering a deal card reveals its next follow-up (mouse only)", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The hover preview is a mouse affordance; touch projects never trigger it."
  );

  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Tooltip Co ${stamp}`;
  const followUpAction = `Call the architect ${stamp}`;

  await enableTooltips(page);

  // Quick-add a lead, then give it an open follow-up so the preview has data.
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 111 222");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName })
    .click();
  await page.getByLabel("Next action *").fill(followUpAction);
  await page.getByLabel("Due *").fill(awstInputDate(new Date(Date.now())));
  await page.getByRole("button", { name: "Add follow-up" }).click();
  await expect(
    page.locator('section[aria-label="Follow-ups"]').getByText(followUpAction)
  ).toBeVisible();

  // Back on the board, the action only exists inside the hover preview.
  await page.goto("/pipeline");
  const card = page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName });
  await card.scrollIntoViewIfNeeded();
  await card.hover();

  await expect(page.getByText("Next follow-up", { exact: true })).toBeVisible();
  await expect(page.getByText(followUpAction)).toBeVisible();
});
