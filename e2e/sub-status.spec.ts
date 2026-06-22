import { expect, test } from "@playwright/test";

const HOLD_LABEL = "On Hold – Awaiting Client";
const OTHER_LABEL = "Blocked – External Dependency";
const HOLD_NOTE = "Waiting on creative from XYZ Agency";

// Drive the full sub-status lifecycle on one deal so the suite stays light:
// apply a label + note, see it on the card, filter the board by it, see it
// counted on reports, then clear it.
test("sub-status applies, filters, reports, and clears", async ({
  page,
}, testInfo) => {
  const companyName = `E2E-hold ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 333 444");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  const card = page.locator("article", {
    has: page.getByRole("heading", { name: companyName }),
  });
  await expect(card).toBeVisible();

  // Apply the label and note. Clicks can race hydration on a fresh nav, so
  // retry the open-fill-save sequence until the badge lands.
  await expect(async () => {
    await card.getByRole("button", { name: "Add status" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByText(HOLD_LABEL).click();
    await dialog.getByLabel("Note (optional)").fill(HOLD_NOTE);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(
      card.getByRole("button", { name: `Sub-status: ${HOLD_LABEL}. Edit.` })
    ).toBeVisible({ timeout: 8000 });
  }).toPass({ timeout: 25_000 });

  // Filtering by a label the deal lacks hides it; adding its own label shows it.
  await page.getByRole("button", { name: OTHER_LABEL, exact: true }).click();
  await expect(card).toBeHidden();
  await page.getByRole("button", { name: HOLD_LABEL, exact: true }).click();
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();

  // Reports surfaces the label under the on-hold / blocked breakdown.
  await page.goto("/reports");
  const onHold = page.locator('section[aria-label="On hold and blocked"]');
  await expect(onHold.getByText(HOLD_LABEL)).toBeVisible();

  // Clear the label back off and confirm the badge is gone.
  await page.goto("/pipeline");
  await expect(async () => {
    await card
      .getByRole("button", { name: `Sub-status: ${HOLD_LABEL}. Edit.` })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.getByText("None (progressing normally)").click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(card.getByRole("button", { name: "Add status" })).toBeVisible({
      timeout: 8000,
    });
  }).toPass({ timeout: 25_000 });
});
