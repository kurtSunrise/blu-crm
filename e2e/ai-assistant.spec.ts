import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { queryRows } from "./test-db";

// AI assistant (M4 / FR-7) Phase 1: panel opens from the shell, messages
// stream from /api/chat, tool calls run against the real DB, and artifact
// cards render. Phase 2: write tools pause for confirmation (FR-7.8) and the
// ai_audit_log records the full lifecycle. The Anthropic API is replaced by
// e2e/mock-anthropic-server.ts via ANTHROPIC_BASE_URL, so responses are
// scripted and deterministic.

const RESPONSE_TIMEOUT_MS = 20_000;
const ASSISTANT_BUTTON_NAME = /assistant/i;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const openAssistant = async (page: Page): Promise<void> => {
  await page
    .getByRole("button", { name: ASSISTANT_BUTTON_NAME })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" })
  ).toBeVisible();
};

const askAssistant = async (page: Page, message: string): Promise<void> => {
  await page
    .getByRole("textbox", { name: "Message the assistant" })
    .fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
};

// Reusing an already-running dev server that lacks the mock AI env vars
// makes the assistant report 503; skip rather than fail in that case.
const skipUnlessAssistantConfigured = async (
  page: Page,
  testInfo: { skip: (condition: boolean, description: string) => void }
): Promise<void> => {
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/chat", {
      body: JSON.stringify({
        message: "configuration probe",
        pageContext: { pathname: "/" },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return response.status;
  });
  testInfo.skip(
    status === 503,
    "Assistant not configured; restart Playwright so the dev server boots with the mock Anthropic env"
  );
};

test("assistant panel streams a mocked text reply", async ({ page }) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  await openAssistant(page);
  await askAssistant(page, "Hello there");

  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
});

test("a pipeline question runs a tool and renders deal cards", async ({
  page,
  request,
}) => {
  // Seed an unassigned inbox lead through the public enquiry endpoint.
  const stamp = Date.now();
  const companyName = `AI Mock Co ${stamp}`;
  const enquiry = await request.post("/api/enquiries", {
    data: {
      company: companyName,
      email: "ai-e2e@example.com",
      message: "Testing the assistant inbox artifact",
      name: `AI Test ${stamp}`,
    },
  });
  expect(enquiry.ok()).toBeTruthy();

  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  await openAssistant(page);
  await askAssistant(page, "What's in the inbox?");

  // The mock returns a get_inbox_leads tool_use; the real tool queries the
  // DB and the artifact card lists the lead we just created.
  const artifact = page.locator(
    'section[aria-label="Inbox: unassigned leads"]'
  );
  await expect(artifact).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  // The lead's title and company line both carry the company name.
  await expect(artifact.getByText(companyName).first()).toBeVisible();
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible();
});

// Each run gets a token the mock echoes back as the lead's company name, so
// parallel projects sharing one DB never collide (mock matches /UNIQ-\d+/).
const uniqueCompanyToken = (): string =>
  `UNIQ-${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Latest audit status for the create_lead proposal carrying this token.
const auditStatusForToken = async (token: string): Promise<string | null> => {
  const rows = await queryRows<{ status: string }>(
    `select status from ai_audit_log
     where tool_name = 'create_lead' and input::text like $1
     order by created_at desc limit 1`,
    [`%${token}%`]
  );
  return rows[0]?.status ?? null;
};

// Drives the shared first half of the confirmation flow: ask for a capture,
// wait for the gated write's review card, and return it.
const requestLeadCapture = async (
  page: Page,
  token: string
): Promise<Locator> => {
  await openAssistant(page);
  await askAssistant(
    page,
    `Capture this enquiry: ${token} wants a Christmas display`
  );
  const card = page.locator('section[aria-label="Confirm: Create a new lead"]');
  await expect(card).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  // The card shows exactly what would change before anything is applied.
  await expect(card.getByText(token)).toBeVisible();
  return card;
};

test("a gated write waits for confirmation and executes on confirm", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const token = uniqueCompanyToken();
  const card = await requestLeadCapture(page, token);

  // Proposed and waiting; nothing has been written yet.
  await expect
    .poll(() => auditStatusForToken(token), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("proposed");

  await card.getByRole("button", { name: "Confirm" }).click();

  await expect(card.getByRole("status")).toHaveText("Approved");
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(token), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("executed");

  // The lead is real: it lands in the inbox (no owner was proposed).
  await page.goto("/inbox");
  await expect(page.getByText(token).first()).toBeVisible();
});

test("a cancelled write changes nothing", async ({ page }) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const token = uniqueCompanyToken();
  const card = await requestLeadCapture(page, token);

  await card.getByRole("button", { name: "Cancel" }).click();

  await expect(card.getByRole("status")).toHaveText(
    "Cancelled, nothing was changed"
  );
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(token), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("denied");

  await page.goto("/inbox");
  await expect(
    page.getByRole("heading", { level: 1, name: "Inbox" })
  ).toBeVisible();
  await expect(page.getByText(token)).toHaveCount(0);
});

test("open assistant panel has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  await openAssistant(page);

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .include('aside[aria-label="Blu assistant"]')
    .analyze();
  expect(results.violations).toEqual([]);
});
