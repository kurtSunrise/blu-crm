import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// M0 auth: email/password sign-in for the Blu team. These specs run
// signed-out (fresh storage state), unlike the rest of the suite, which
// reuses the session created in global-setup.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const E2E_EMAIL = "kurt@blu.builders";
const E2E_PASSWORD = process.env.SEED_USER_PASSWORD ?? "blu-crm-dev";

test.use({ storageState: { cookies: [], origins: [] } });

const signIn = async (
  page: import("@playwright/test").Page,
  email: string,
  password: string
): Promise<void> => {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
};

test("unauthenticated visits bounce to the sign-in page", async ({ page }) => {
  await page.goto("/pipeline");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Sign in to Blu CRM" })
  ).toBeVisible();
});

test("a wrong password is rejected with a readable error", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, E2E_EMAIL, "definitely-not-the-password");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sign in and sign out round trip", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);

  // Landed in the app shell: the primary nav is there.
  await expect(page).toHaveURL("/");
  await expect(
    page
      .getByRole("link", { name: "Pipeline" })
      .filter({ visible: true })
      .first()
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Sign out" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/sign-in/);

  // The session is really gone: app pages bounce again.
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("public surfaces stay reachable signed out", async ({ page }) => {
  await page.goto("/enquire");
  await expect(page).toHaveURL(/\/enquire/);
  await expect(
    page.getByRole("heading", { name: "Start a project with Blu" })
  ).toBeVisible();
});

test("sign-in page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in to Blu CRM" })
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
