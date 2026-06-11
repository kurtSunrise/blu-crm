import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated WCAG 2.1 A/AA scan of every static route using axe-core.
// Catches missing labels, contrast failures, landmark/heading problems,
// and ARIA misuse. Dynamic detail pages are covered separately below by
// navigating from their listing pages when data exists.

const STATIC_ROUTES = [
  { path: "/", name: "dashboard" },
  { path: "/pipeline", name: "pipeline" },
  { path: "/contacts", name: "contacts" },
  { path: "/contacts/new", name: "new contact" },
  { path: "/deals/new", name: "new deal" },
  { path: "/tasks", name: "tasks" },
  { path: "/calendar", name: "calendar" },
  { path: "/inbox", name: "inbox" },
  { path: "/notifications", name: "notifications" },
  { path: "/reports", name: "reports" },
  { path: "/reports/weekly", name: "weekly report" },
  { path: "/settings", name: "settings" },
  { path: "/settings/import", name: "csv import" },
  { path: "/help", name: "help" },
  { path: "/enquire", name: "public enquiry" },
];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const formatViolations = (
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]
): string =>
  violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => node.target.join(" "))
        .join("\n    ");
      return `${violation.id} (${violation.impact}): ${violation.help}\n    ${targets}`;
    })
    .join("\n");

for (const route of STATIC_ROUTES) {
  test(`${route.name} page has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(
      results.violations,
      formatViolations(results.violations)
    ).toHaveLength(0);
  });
}

test("first deal detail page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/pipeline");
  await page.waitForLoadState("networkidle");
  const dealLink = page.locator('a[href^="/deals/"]:not([href="/deals/new"])');
  if ((await dealLink.count()) === 0) {
    test.skip(true, "No deals in the database to scan");
  }
  const dealHref = await dealLink.first().getAttribute("href");
  await page.goto(dealHref ?? "/pipeline");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, formatViolations(results.violations)).toHaveLength(
    0
  );
});

test("first company detail page has no WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/pipeline");
  await page.waitForLoadState("networkidle");
  const dealLink = page.locator('a[href^="/deals/"]:not([href="/deals/new"])');
  if ((await dealLink.count()) === 0) {
    test.skip(true, "No deals in the database to scan");
  }
  const dealHref = await dealLink.first().getAttribute("href");
  await page.goto(dealHref ?? "/pipeline");
  await page.waitForLoadState("networkidle");
  const companyLink = page.locator('a[href^="/companies/"]');
  if ((await companyLink.count()) === 0) {
    test.skip(true, "First deal has no linked company to scan");
  }
  const companyHref = await companyLink.first().getAttribute("href");
  await page.goto(companyHref ?? "/pipeline");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, formatViolations(results.violations)).toHaveLength(
    0
  );
});

test("first contact detail page has no WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/contacts");
  await page.waitForLoadState("networkidle");
  const contactLink = page.locator(
    'a[href^="/contacts/"]:not([href="/contacts/new"])'
  );
  if ((await contactLink.count()) === 0) {
    test.skip(true, "No contacts in the database to scan");
  }
  const contactHref = await contactLink.first().getAttribute("href");
  await page.goto(contactHref ?? "/contacts");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, formatViolations(results.violations)).toHaveLength(
    0
  );
});

// The brand palette swaps tokens in dark mode (e.g. --blu #005eb1 → #0082e5),
// so contrast must hold in both themes. Re-scan a representative page set
// with the system theme emulated as dark.
test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  const DARK_ROUTES = [
    { path: "/", name: "dashboard" },
    { path: "/pipeline", name: "pipeline" },
    { path: "/contacts", name: "contacts" },
    { path: "/settings", name: "settings" },
    { path: "/enquire", name: "public enquiry" },
  ];

  for (const route of DARK_ROUTES) {
    test(`${route.name} page has no WCAG A/AA violations in dark mode`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(
        results.violations,
        formatViolations(results.violations)
      ).toHaveLength(0);
    });
  }
});
