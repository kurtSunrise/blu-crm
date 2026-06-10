import { expect, test } from "@playwright/test";

test("dashboard renders the key pipeline numbers and sections", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const kpis = page.locator('section[aria-label="Key numbers"]');
  await expect(kpis.getByText("Open pipeline", { exact: false })).toBeVisible();
  await expect(
    kpis.getByText("Weighted forecast", { exact: false })
  ).toBeVisible();
  await expect(kpis.getByText("Win rate", { exact: false })).toBeVisible();
  await expect(
    kpis.getByText("Overdue follow-ups", { exact: false })
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Pipeline by stage" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Today's tasks" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent activity" })
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Quick add lead" })
  ).toBeVisible();
});
