import { expect, test } from "@playwright/test";

const WON_TOGGLE_PATTERN = /Won/;
const LOST_TOGGLE_PATTERN = /Lost/;

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

  // The board updates optimistically; wait for the server action's POST to
  // come back before navigating, or the move may never be committed.
  const moveCommitted = page.waitForResponse(
    (response) => response.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: "Mark as won" }).click();
  await moveCommitted;

  // Won is a collapsed summary column by default; expand it to see the card.
  const wonColumn = page.locator('section[aria-label="Won"]');
  await wonColumn.getByRole("button", { name: WON_TOGGLE_PATTERN }).click();
  await expect(
    wonColumn.getByRole("heading", { name: companyName })
  ).toBeVisible();

  // The handover notification lands for delivery (FR-11.1). The board
  // updates optimistically, so the server write can still be in flight;
  // poll with reloads rather than waiting on one server-rendered response.
  await expect(async () => {
    await page.goto("/notifications");
    await expect(
      page
        .locator("li")
        .filter({ hasText: `${companyName} was won` })
        .first()
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
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
  const moveCommitted = page.waitForResponse(
    (response) => response.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: "Mark as lost" }).click();
  await moveCommitted;

  // Lost / Dormant is a collapsed summary column by default; expand it first.
  const lostColumn = page.locator('section[aria-label="Lost / Dormant"]');
  await lostColumn.getByRole("button", { name: LOST_TOGGLE_PATTERN }).click();
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
