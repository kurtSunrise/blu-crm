import { expect, test } from "@playwright/test";

test("home page renders the Blu CRM shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Blu CRM" })).toBeVisible();
  await expect(page.getByText("Pipeline", { exact: true })).toBeVisible();
  await expect(page.getByText("Contacts", { exact: true })).toBeVisible();
});
