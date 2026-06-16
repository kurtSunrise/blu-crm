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
const LEAD_ID_PATTERN = /BLU-/;
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

// Latest audit row for the create_lead proposal carrying this token in its
// model-proposed input; final_input captures any user edits at confirm.
const auditRowForToken = async (
  token: string
): Promise<{ finalInput: string | null; status: string } | null> => {
  const rows = await queryRows<{ final_input: string | null; status: string }>(
    `select final_input::text as final_input, status from ai_audit_log
     where tool_name = 'create_lead' and input::text like $1
     order by created_at desc limit 1`,
    [`%${token}%`]
  );
  const row = rows[0];
  return row ? { finalInput: row.final_input, status: row.status } : null;
};

const auditStatusForToken = async (token: string): Promise<string | null> =>
  (await auditRowForToken(token))?.status ?? null;

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
  // The card shows exactly what would change, in editable fields.
  await expect(card.getByLabel("company name")).toHaveValue(token);
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

test("an edited confirmation applies the edited values (two-way sync)", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const proposedToken = uniqueCompanyToken();
  const editedToken = uniqueCompanyToken();
  const card = await requestLeadCapture(page, proposedToken);

  // Rework the proposal before approving it; the edit rides the
  // confirmation as finalInput and is re-validated server-side.
  await card.getByLabel("company name").fill(editedToken);
  await card.getByRole("button", { name: "Confirm" }).click();

  await expect(card.getByRole("status")).toHaveText("Approved");
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(proposedToken), {
      timeout: RESPONSE_TIMEOUT_MS,
    })
    .toBe("executed");

  // The audit trail keeps both: the model's proposal and what was applied.
  const audit = await auditRowForToken(proposedToken);
  expect(audit?.finalInput).toContain(editedToken);

  await page.goto("/inbox");
  await expect(page.getByText(editedToken).first()).toBeVisible();
  await expect(page.getByText(proposedToken)).toHaveCount(0);
});

test("a draft artifact is editable in place", async ({ page }) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  await openAssistant(page);
  await askAssistant(page, "Draft a follow-up email for Westfield");

  const card = page.locator('section[aria-label="Follow-up to Westfield"]');
  await expect(card).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(card.getByText("draft only", { exact: false })).toBeVisible();

  await card.getByRole("button", { name: "Edit draft" }).click();
  const body = card.getByLabel("Draft body");
  await body.fill("Hi Sarah,\n\nReworked in place before sending.\n\nCheers");
  await card.getByRole("button", { name: "Finish editing draft" }).click();

  await expect(
    card.getByText("Reworked in place before sending.")
  ).toBeVisible();
  await expect(card.getByText("edited draft", { exact: false })).toBeVisible();
});

test("chase priority runs the scoring tool and renders ranked deals", async ({
  page,
  request,
}) => {
  // An unassigned inbox lead is still an open deal, so it must appear in
  // the ranked list with the seeded company name.
  const stamp = Date.now();
  const companyName = `Chase Co ${stamp}`;
  const enquiry = await request.post("/api/enquiries", {
    data: {
      company: companyName,
      email: "chase-e2e@example.com",
      message: "Scoring fixture lead",
      name: `Chase Test ${stamp}`,
    },
  });
  expect(enquiry.ok()).toBeTruthy();

  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  await openAssistant(page);
  await askAssistant(page, "Which deals should I chase first?");

  const artifact = page.locator('section[aria-label="Deals to chase first"]');
  await expect(artifact).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  // Ranked rows carry lead IDs. The seeded lead guarantees a non-empty
  // ranking, but parallel projects share the DB, so any row satisfies this.
  await expect(artifact.getByText(LEAD_ID_PATTERN).first()).toBeVisible();
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible();
});

test("a conversation can be resumed from history", async ({ page }) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  // The marker lands in the thread title, so this run's thread is
  // findable in a history list shared across parallel projects.
  const marker = `HIST-${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await openAssistant(page);
  await askAssistant(page, `${marker} hello`);
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  // New conversation: the panel resets to the welcome state.
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByText("Hello from the mock assistant.")).toHaveCount(0);
  await expect(
    page.getByText("Ask about the pipeline", { exact: false })
  ).toBeVisible();

  // Resume the earlier thread from history; its transcript comes back.
  await page.getByRole("button", { name: "Conversation history" }).click();
  await page.getByRole("button", { name: new RegExp(marker) }).click();
  await expect(page.getByText(`${marker} hello`)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible();

  // Continuing appends to the same persisted thread instead of forking.
  await askAssistant(page, "hello again");
  await expect(page.getByText("Hello from the mock assistant.")).toHaveCount(
    2,
    { timeout: RESPONSE_TIMEOUT_MS }
  );
  const threads = await queryRows<{ count: string }>(
    "select count(*) as count from chat_thread where title like $1",
    [`%${marker}%`]
  );
  expect(threads[0]?.count).toBe("1");
});

// 1x1 red pixel PNG, reused from the deal-attachment fixture.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ASSISTANT_PANEL = 'aside[aria-label="Blu assistant"]';

test("an attached image rides the next message and clears after send", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  await openAssistant(page);

  // The composer file input is hidden behind the paperclip button; set the
  // fixture directly on it.
  await page.locator(`${ASSISTANT_PANEL} input[type="file"]`).setInputFiles({
    buffer: Buffer.from(PNG_BASE64, "base64"),
    mimeType: "image/png",
    name: "blu-brief.png",
  });

  // The staged chip appears once the upload to R2 completes.
  await expect(
    page.locator(ASSISTANT_PANEL).getByText("blu-brief.png")
  ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });

  // Sending carries the uploaded attachment id to /api/chat.
  const chatRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/chat" &&
      request.method() === "POST"
  );
  await askAssistant(page, "What's in this image?");
  const sent = await chatRequest;
  const body = JSON.parse(sent.postData() ?? "{}") as {
    attachmentIds?: string[];
  };
  expect(body.attachmentIds).toHaveLength(1);

  // The reply streams back and the staged chip is consumed.
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(
    page.locator(ASSISTANT_PANEL).getByText("blu-brief.png")
  ).toHaveCount(0);
});

test("the chat upload endpoint rejects unsupported file types", async ({
  request,
}) => {
  const missingFile = await request.post("/api/chat/attachments", {
    multipart: {},
  });
  expect(missingFile.status()).toBe(400);

  const badType = await request.post("/api/chat/attachments", {
    multipart: {
      file: {
        buffer: Buffer.from("echo hi"),
        mimeType: "application/x-sh",
        name: "script.sh",
      },
    },
  });
  expect(badType.status()).toBe(400);
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
