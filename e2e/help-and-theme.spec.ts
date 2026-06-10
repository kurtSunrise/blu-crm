import { expect, test } from "@playwright/test";

const TOGGLE_NAME = /Switch to (light|dark) mode/;
const DARK_CLASS = /dark/;

test("help area renders contents, sections, FAQ, and glossary", async ({
  page,
}) => {
  await page.goto("/help");
  await expect(
    page.getByRole("heading", { name: "Help and guides" })
  ).toBeVisible();

  // Contents links jump to their sections.
  const contents = page.locator('nav[aria-label="Help contents"]');
  await contents.getByRole("link", { name: "Work the pipeline" }).click();
  await expect(
    page.getByRole("heading", { name: "Work the pipeline" })
  ).toBeVisible();

  // FAQ entries expand.
  const faq = page.locator('section[aria-label="FAQ"]');
  await faq
    .getByText("Why is a deal not showing in the open pipeline total?")
    .click();
  await expect(
    faq.getByText("Won and Lost / Dormant deals are excluded")
  ).toBeVisible();

  await expect(
    page.locator('section[aria-label="Glossary"]').getByText("Lead ID")
  ).toBeVisible();
});

test("theme toggle switches between dark and light mode", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");

  // Default follows the system; Playwright's default emulation is light.
  const toggle = page.getByRole("button", { name: TOGGLE_NAME }).first();
  await expect(toggle).toBeVisible();

  const initialLabel = await toggle.getAttribute("aria-label");
  await toggle.click();

  if (initialLabel === "Switch to dark mode") {
    await expect(html).toHaveClass(DARK_CLASS);
  } else {
    await expect(html).not.toHaveClass(DARK_CLASS);
  }

  // Toggling back restores the original scheme.
  await page.getByRole("button", { name: TOGGLE_NAME }).first().click();
  if (initialLabel === "Switch to dark mode") {
    await expect(html).not.toHaveClass(DARK_CLASS);
  } else {
    await expect(html).toHaveClass(DARK_CLASS);
  }
});
