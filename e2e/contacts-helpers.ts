import { expect, type Page } from "@playwright/test";

// Filling before React hydrates leaves the client-side filter unapplied:
// the DOM input holds the text, React's value tracker initialises to it on
// hydration, and a repeat fill with the same text is deduped as no change.
// Clearing first forces a real change event each attempt; retry until the
// filter visibly engages. The results status line only renders once the
// client-side filter is live, which makes it a reliable engagement signal
// on every viewport (the companies section is behind a toggle on phones).
export const fillContactsSearch = async (page: Page, query: string) => {
  const search = page.getByLabel("Search contacts");
  await expect(async () => {
    await search.fill("");
    await search.fill(query);
    await expect(resultsStatus(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
};

// The "X people · Y companies match" live region in the directory toolbar.
export const resultsStatus = (page: Page) =>
  page.getByRole("status").filter({ hasText: "match" });

// Accessible name of the mobile People/Companies toggle's companies segment,
// which includes a live count, e.g. "Companies (23)".
export const COMPANIES_TOGGLE_NAME = /^Companies \(/;

// Below the lg breakpoint the directory shows one section at a time behind a
// People/Companies toggle; desktop shows both side by side. Clicks retry
// until the section is revealed, which also rides out the hydration race.
export const openCompaniesSection = async (page: Page) => {
  const toggle = page.getByRole("button", { name: COMPANIES_TOGGLE_NAME });
  if (!(await toggle.isVisible())) {
    return;
  }
  const section = page.locator('section[aria-label="Companies"]');
  await expect(async () => {
    await toggle.click();
    await expect(section).toBeVisible({ timeout: 1000 });
  }).toPass();
};
