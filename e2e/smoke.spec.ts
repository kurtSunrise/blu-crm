import { expect, test } from "@playwright/test";

test("home page renders the Blu CRM shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Blu CRM" })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText("Pipeline", { exact: true })).toBeVisible();
  await expect(main.getByText("Contacts", { exact: true })).toBeVisible();
});
