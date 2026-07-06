import { expect, test } from "@playwright/test";

// The bottom tab bar is a phone-only surface (hidden at md and up), so these
// specs only run on the phone project; tablet and desktop use the sidebar.
test.skip(
  ({ viewport }) => !viewport || viewport.width >= 768,
  "bottom tab bar is a phone-only surface"
);

const TAB_LABELS = ["Pipeline", "Calendar", "Inbox", "Tasks", "Quick add"];
const CONTACTS_URL = /\/contacts/;
const REPORTS_URL = /\/reports/;

test("bottom tab bar keeps the five field tabs plus More", async ({ page }) => {
  await page.goto("/");
  const tabBar = page.locator('nav[aria-label="Primary"]:visible');
  for (const label of TAB_LABELS) {
    await expect(tabBar.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(tabBar.getByRole("button", { name: "More" })).toBeVisible();
});

test("the More tab reaches Contacts and Reports", async ({ page }) => {
  await page.goto("/");

  const openMore = async () => {
    // Clicks can race hydration on a fresh nav, so retry until the menu opens.
    await expect(async () => {
      await page.getByRole("button", { name: "More" }).click();
      await expect(
        page.getByRole("menuitem", { name: "Contacts" })
      ).toBeVisible({ timeout: 2000 });
    }).toPass();
  };

  await openMore();
  await expect(page.getByRole("menuitem", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Reports" })).toBeVisible();

  await page.getByRole("menuitem", { name: "Contacts" }).click();
  await expect(page).toHaveURL(CONTACTS_URL);
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();

  await openMore();
  await page.getByRole("menuitem", { name: "Reports" }).click();
  await expect(page).toHaveURL(REPORTS_URL);
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true })
  ).toBeVisible();
});
