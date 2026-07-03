import { expect, test } from "@playwright/test";
import { queryRows } from "./test-db";

test("a sent quote viewed by the client alerts the owner (US-09)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Quote Co ${stamp}`;

  // A deal owned by Jess, since the viewed alert goes to the deal owner.
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Email").fill(`quote-${stamp}@example.com`);
  await page.getByLabel("Owner").selectOption({ label: "Jessica Rodin" });
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName })
    .click();

  // Draft → Sent generates the tokenised client link (FR-6.1, FR-6.2).
  const quotesSection = page.locator('section[aria-label="Quotes"]');
  await page.getByLabel("Quote value (AUD) *").fill("12500");
  await page.getByRole("button", { name: "Add quote" }).click();
  await expect(quotesSection.getByText("$12,500")).toBeVisible();
  await expect(quotesSection.getByText("Draft")).toBeVisible();

  await quotesSection.getByRole("button", { name: "Mark as sent" }).click();
  const clientLink = quotesSection.getByRole("link", {
    name: "Client view link",
  });
  await expect(clientLink).toBeVisible();
  const href = await clientLink.getAttribute("href");
  expect(href).toBeTruthy();

  // The public page shows only the quote and flips it to Viewed.
  await page.goto(href as string);
  await expect(page.getByText("Your quote")).toBeVisible();
  await expect(page.getByText("$12,500")).toBeVisible();
  await expect(page.getByText(companyName)).toBeVisible();

  // The viewed alert targets the deal owner (Jess), so it lands in HER
  // per-user feed, not Kurt's; assert the row server-side.
  await expect(async () => {
    const rows = await queryRows<{ email: string }>(
      `select u.email from "notification" n
       join "user" u on u.id = n.user_id
       where n.type = 'quote_viewed' and n.payload->>'dealTitle' like $1`,
      [`%${companyName}%`]
    );
    expect(rows.map((row) => row.email)).toContain("jess@blu.builders");
  }).toPass({ timeout: 15_000 });

  await page.goto("/notifications");
  await expect(
    page
      .locator("li")
      .filter({ hasText: "Quote viewed" })
      .filter({ hasText: companyName })
  ).toHaveCount(0);
});

test("an accepted quote's value rolls into the deal (FR-6.1)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Accept Co ${stamp}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 777 888");
  await page.getByLabel("Value guess min (AUD)").fill("8000");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName })
    .click();

  const quotesSection = page.locator('section[aria-label="Quotes"]');
  await page.getByLabel("Quote value (AUD) *").fill("9750");
  await page.getByRole("button", { name: "Add quote" }).click();
  await quotesSection.getByRole("button", { name: "Mark as sent" }).click();
  await quotesSection.getByRole("button", { name: "Accepted" }).click();
  await expect(quotesSection.getByText("Accepted")).toBeVisible();

  // Quoted value wins over the estimate in the deal header (FR-1.4 AC).
  await expect(
    page.locator("main").getByText("$9,750", { exact: true }).first()
  ).toBeVisible();
});
