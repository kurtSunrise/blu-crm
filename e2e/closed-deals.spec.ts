import { expect, test } from "@playwright/test";

const VIEW_ALL_PATTERN = /View all/;

const markFirstDealWon = async (
  page: import("@playwright/test").Page,
  companyName: string
) => {
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 555 666");
  await page.getByLabel("Value guess (AUD)").fill("12000");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

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
};

test("closed view lists a won deal and filters by outcome", async ({
  page,
}, testInfo) => {
  const companyName = `Closed Won ${testInfo.project.name} ${Date.now()}`;

  await markFirstDealWon(page, companyName);

  await page.goto("/pipeline/closed");
  await expect(
    page.getByRole("heading", { name: "Closed deals", exact: true })
  ).toBeVisible();

  const row = page.getByRole("link", { name: new RegExp(companyName) });
  await expect(row).toBeVisible();

  // Filtering to Lost hides a won deal; switching back to Won restores it.
  await page.getByRole("button", { name: "Lost / Dormant" }).click();
  await expect(row).toBeHidden();
  await page.getByRole("button", { name: "Won", exact: true }).click();
  await expect(row).toBeVisible();
});

test("board 'View all' link opens the closed view scoped to Won", async ({
  page,
}) => {
  await page.goto("/pipeline");
  const won = page.locator('section[aria-label="Won"]');
  await won.getByRole("link", { name: VIEW_ALL_PATTERN }).click();

  await page.waitForURL("**/pipeline/closed**");
  // Arriving from the Won column pre-selects the Won outcome filter.
  await expect(
    page.getByRole("button", { name: "Won", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
});
