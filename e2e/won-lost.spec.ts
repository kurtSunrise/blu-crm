import { expect, test } from "@playwright/test";

const quickAddDeal = async (
  page: import("@playwright/test").Page,
  companyName: string
) => {
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 333 444");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");
};

test("marking Won prompts for handover and notifies delivery (US-10)", async ({
  page,
}, testInfo) => {
  const companyName = `Won Co ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName);
  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Won", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Mark as Won" })
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Flag handover to delivery (notifies Kurt)")
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Mark as won" }).click();

  const wonColumn = page.locator('section[aria-label="Won"]');
  await expect(
    wonColumn.getByRole("heading", { name: companyName })
  ).toBeVisible();

  // The handover notification lands for delivery (FR-11.1).
  await page.goto("/notifications");
  await expect(
    page
      .locator("li")
      .filter({ hasText: `${companyName} was won` })
      .first()
  ).toBeVisible();
});

test("Lost / Dormant requires a reason before the move applies (US-10)", async ({
  page,
}, testInfo) => {
  const companyName = `Lost Co ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName);
  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Lost / Dormant" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Mark as Lost / Dormant")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Mark as lost" })
  ).toBeDisabled();

  await dialog.getByLabel("Reason *").selectOption("price");
  await dialog.getByRole("button", { name: "Mark as lost" }).click();

  const lostColumn = page.locator('section[aria-label="Lost / Dormant"]');
  await expect(
    lostColumn.getByRole("heading", { name: companyName })
  ).toBeVisible();

  // The reason is recorded on the deal (FR-1.6 AC).
  await lostColumn.getByRole("heading", { name: companyName }).click();
  await expect(page.getByText("Lost reason")).toBeVisible();
  await expect(page.getByText("Price", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Moved to Lost / Dormant (reason: Price)")
  ).toBeVisible();
});

test("cancelling the Lost dialog leaves the deal in place (US-10)", async ({
  page,
}, testInfo) => {
  const companyName = `Stay Co ${testInfo.project.name} ${Date.now()}`;

  await quickAddDeal(page, companyName);
  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Lost / Dormant" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();

  await expect(
    page
      .locator('section[aria-label="Lead Captured"]')
      .getByRole("heading", { name: companyName })
  ).toBeVisible();
});
