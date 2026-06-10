import { expect, test } from "@playwright/test";

// FR-1.3 customisable stages. Tests only ever touch stages they create,
// so the eight defaults that other specs rely on stay untouched even with
// the three browser projects running in parallel.

const stagesCard = (page: import("@playwright/test").Page) =>
  page.locator('section[aria-label="Pipeline stages"]');

test("a stage can be added, renamed, reordered, and removed (FR-1.3)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  const stageName = `Temp Stage ${stamp}`;
  const renamedName = `Renamed Stage ${stamp}`;

  await page.goto("/settings");
  const card = stagesCard(page);
  await card.getByLabel("New stage name").fill(stageName);
  await card.getByRole("button", { name: "Add stage" }).click();
  await expect(card.getByText("Stage added.")).toBeVisible();
  await expect(card.getByText(stageName, { exact: true })).toBeVisible();

  // The new stage is a real board column.
  await page.goto("/pipeline");
  await expect(
    page.getByRole("heading", { name: stageName, exact: true })
  ).toBeVisible();

  await page.goto("/settings");
  await card.getByRole("button", { name: `Rename ${stageName}` }).click();
  await card.getByLabel(`New name for ${stageName}`).fill(renamedName);
  await card.getByRole("button", { name: "Save name" }).click();
  await expect(card.getByText("Stage renamed.")).toBeVisible();
  await expect(card.getByText(renamedName, { exact: true })).toBeVisible();

  await card.getByRole("button", { name: `Move ${renamedName} up` }).click();
  await expect(card.getByText("Stage order updated.")).toBeVisible();

  await card.getByRole("button", { name: `Remove ${renamedName}` }).click();
  await card.getByRole("button", { name: "Remove stage" }).click();
  await expect(card.getByText("Stage removed.")).toBeVisible();
  await expect(card.getByText(renamedName, { exact: true })).toBeHidden();
});

test("removing a stage with deals requires reassigning them (FR-1.3 AC)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name} ${Date.now()}`;
  const stageName = `Busy Stage ${stamp}`;
  const companyName = `Stage Reassign Co ${stamp}`;

  await page.goto("/settings");
  const card = stagesCard(page);
  await card.getByLabel("New stage name").fill(stageName);
  await card.getByRole("button", { name: "Add stage" }).click();
  await expect(card.getByText("Stage added.")).toBeVisible();

  // Put one deal into the new stage via the board's card menu.
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 333 444");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");
  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: stageName }).click();
  await expect(
    page
      .locator(`section[aria-label="${stageName}"]`)
      .getByRole("heading", { name: companyName })
  ).toBeVisible();

  // Removing the stage asks where its deals should go.
  await page.goto("/settings");
  await card.getByRole("button", { name: `Remove ${stageName}` }).click();
  await card
    .getByLabel("Move its deals to")
    .selectOption({ label: "Lead Captured" });
  await card.getByRole("button", { name: "Remove stage" }).click();
  await expect(card.getByText("Stage removed.")).toBeVisible();
  await expect(card.getByText(stageName, { exact: true })).toBeHidden();

  // The deal survived the move and its history with it.
  await page.goto("/pipeline");
  await expect(
    page
      .locator('section[aria-label="Lead Captured"]')
      .getByRole("heading", { name: companyName })
  ).toBeVisible();
});

test("Won and Lost / Dormant cannot be removed", async ({ page }) => {
  await page.goto("/settings");
  const card = stagesCard(page);
  await expect(card.getByText("Won", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Remove Won" })).toBeHidden();
  await expect(
    card.getByRole("button", { name: "Remove Lost / Dormant" })
  ).toBeHidden();
});
