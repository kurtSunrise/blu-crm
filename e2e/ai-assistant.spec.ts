import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type Locator,
  type Page,
  request as playwrightRequest,
  test,
} from "@playwright/test";
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
const THINKING_INDICATOR_PATTERN = /Thinking/;
const TIMEOUT_MESSAGE_PATTERN = /took too long to respond/i;
const ALREADY_RESOLVED_PATTERN = /already resolved/i;
const ASK_AI_PREFILL_PATTERN = /Summarise deal BLU-/;
const STOP_RECORDING_PATTERN = /Stop recording/;
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

test("a thinking turn shows a live indicator before the reply", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  await openAssistant(page);
  // The mock pings (forwarded as a "thinking" status) then pauses before the
  // answer, so the placeholder must appear before real text replaces it. The
  // indicator is animated dots labelled "Thinking" (no visible text since the
  // upgrade), so it is located by its status role and accessible name.
  await askAssistant(page, "Take a moment to think, then reply");

  await expect(
    page.getByRole("status", { name: THINKING_INDICATOR_PATTERN })
  ).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(page.getByText("Here is the considered answer.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
});

test("a stalled response surfaces a retryable error and Try again recovers", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  await openAssistant(page);
  // The mock opens the stream then goes silent; the app's idle timeout (shrunk
  // to 3s via AI_IDLE_TIMEOUT_MS in playwright.config.ts) must abort and show a
  // retryable message rather than spinning forever. The token makes the stall
  // one-shot per run: the mock answers the regenerate retry normally.
  const token = uniqueCompanyToken();
  await askAssistant(page, `Trigger an assistant stall please ${token}`);

  await expect(page.getByText(TIMEOUT_MESSAGE_PATTERN)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  // "Try again" regenerates the turn: the server rolls back to the stalled
  // user message and re-answers it, and this time the mock replies.
  await page.getByRole("button", { name: "Try again" }).click();
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

  // The tool call renders as a live activity chip with its human label.
  const activityChip = page
    .getByRole("status")
    .filter({ hasText: "Checking the inbox" });
  await expect(activityChip).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });

  // The mock returns a get_inbox_leads tool_use; the real tool queries the
  // DB and the artifact card lists the lead we just created.
  const artifact = page.locator(
    'section[aria-label="Inbox: unassigned leads"]'
  );
  await expect(artifact).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  // The lead's title and company line both carry the company name.
  await expect(artifact.getByText(companyName).first()).toBeVisible();
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible();

  // Once the turn completes the chip reaches its done state: still shows the
  // label, no longer announces itself as in progress.
  await expect(activityChip).toBeVisible();
  await expect(activityChip).not.toContainText("in progress");
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

  // Live tool activity: the chip appears with its human label while the
  // scoring tool runs, then settles into its done state.
  const activityChip = page
    .getByRole("status")
    .filter({ hasText: "Ranking open deals" });
  await expect(activityChip).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });

  const artifact = page.locator('section[aria-label="Deals to chase first"]');
  await expect(artifact).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  // Ranked rows carry lead IDs. The seeded lead guarantees a non-empty
  // ranking, but parallel projects share the DB, so any row satisfies this.
  await expect(artifact.getByText(LEAD_ID_PATTERN).first()).toBeVisible();
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible();
  await expect(activityChip).not.toContainText("in progress");

  // After the turn completes, the deterministic follow-up chip for
  // rank_open_deals (src/lib/ai/suggestions.ts) is offered above the
  // composer; clicking it sends that prompt as the next user message.
  const suggestion = page.getByRole("button", {
    name: "Draft a follow-up for the top deal",
  });
  await expect(suggestion).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await suggestion.click();

  // Clicking sent the prompt as a user message and a fresh reply streamed in
  // (the thread history already carries tool_results, so the mock answers
  // every later turn with its closing text; a second copy proves the round
  // trip). The sent bubble carries the suggestion's wording.
  await expect(page.getByText("Mock summary: all done here.")).toHaveCount(2, {
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(
    page.getByText("Draft a follow-up for the top deal").first()
  ).toBeVisible();
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

  // Resume the earlier thread from history; its transcript comes back. The
  // row button and its "Options for" menu button both carry the title, so
  // .first() picks the row.
  await page.getByRole("button", { name: "Conversation history" }).click();
  await page
    .getByRole("button", { name: new RegExp(marker) })
    .first()
    .click();
  // The greeting is unique to the transcript view, so it confirms the switch
  // out of history (whose row and hover preview also carry the marker text)
  // before the sent bubble is asserted.
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(page.getByText(`${marker} hello`).first()).toBeVisible();

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

// assistant-ui's AddAttachment button opens a transient file input, so the
// fixture is delivered through the file chooser rather than a static input.
const attachFixture = async (
  page: Page,
  file: { buffer: Buffer; mimeType: string; name: string }
): Promise<void> => {
  // Dev-only: Next's dev-tools badge (<nextjs-portal>) sits bottom-left and
  // overlaps the attach button on the phone viewport, intercepting the click.
  // It does not exist in production builds, so hiding it changes nothing real.
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Attach an image or PDF" })
    .filter({ visible: true })
    .first()
    .click();
  await (await chooser).setFiles(file);
};

test("an attached image rides the next message and shows on the sent bubble", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  await openAssistant(page);

  await attachFixture(page, {
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

  // The reply streams back and the file now reads as a chip on the sent
  // user message instead of vanishing from the conversation.
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(
    page.locator(ASSISTANT_PANEL).getByText("blu-brief.png")
  ).toBeVisible();
});

test("a resumed conversation still shows its attachment chips", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  await openAssistant(page);

  const marker = `ATT-${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await attachFixture(page, {
    buffer: Buffer.from(PNG_BASE64, "base64"),
    mimeType: "image/png",
    name: "resume-brief.png",
  });
  await expect(
    page.locator(ASSISTANT_PANEL).getByText("resume-brief.png")
  ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });

  await askAssistant(page, `${marker} look at this`);
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  // Start fresh, then resume the thread from history; the persisted blu_media
  // reference must rebuild into a visible chip, not a stray "📎" text line.
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(
    page.locator(ASSISTANT_PANEL).getByText("resume-brief.png")
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Conversation history" }).click();
  await page
    .getByRole("button", { name: new RegExp(marker) })
    .first()
    .click();
  await expect(
    page.locator(ASSISTANT_PANEL).getByText("resume-brief.png")
  ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  // .first(): the history row's hover preview can still carry the same text.
  await expect(page.getByText(`${marker} look at this`).first()).toBeVisible();
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

// ---------------------------------------------------------------------------
// AI assistant upgrade: visible reasoning, retry/regenerate, follow-up chips,
// knowledge citations, card persistence across resume, thread management,
// entry points, and voice input. Mock scenarios in e2e/mock-anthropic-server.
// ---------------------------------------------------------------------------

test("visible reasoning streams open, collapses when the answer starts, and re-expands on click", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  await openAssistant(page);
  // The mock streams thinking deltas, pauses, then answers with text, so the
  // open-while-streaming state is observable before the answer collapses it.
  await askAssistant(page, "Reason through this and reply");

  const reasoningToggle = page.getByRole("button", { name: "Reasoning" });
  const reasoningText = page.getByText("Considering the pipeline", {
    exact: false,
  });
  await expect(reasoningToggle).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  // Open while streaming: the summary text is readable as it arrives.
  await expect(reasoningToggle).toHaveAttribute("aria-expanded", "true");
  await expect(reasoningText).toBeVisible();

  // Once the visible answer starts the section auto-collapses.
  await expect(page.getByText("Here is the reasoned answer.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(reasoningToggle).toHaveAttribute("aria-expanded", "false");
  await expect(reasoningText).toBeHidden();

  // The user can re-open it to review the reasoning.
  await reasoningToggle.click();
  await expect(reasoningToggle).toHaveAttribute("aria-expanded", "true");
  await expect(reasoningText).toBeVisible();
});

// All messages of the one thread carrying this marker, oldest first.
const threadMessageRows = async (
  marker: string
): Promise<{ id: string; role: string }[]> =>
  await queryRows<{ id: string; role: string }>(
    `select m.id, m.role from chat_message m
     join chat_thread t on m.thread_id = t.id
     where t.title like $1
     order by m.created_at asc`,
    [`%${marker}%`]
  );

test("regenerate rolls back and re-answers without duplicating the turn", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const marker = `REGEN-${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await openAssistant(page);
  await askAssistant(page, `${marker} hello`);
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  // One user turn plus one assistant turn are persisted.
  await expect
    .poll(async () => (await threadMessageRows(marker)).length, {
      timeout: RESPONSE_TIMEOUT_MS,
    })
    .toBe(2);
  const beforeAssistantId = (await threadMessageRows(marker)).find(
    (row) => row.role === "assistant"
  )?.id;
  expect(beforeAssistantId).toBeTruthy();

  // The hover action bar on the last assistant message offers Regenerate.
  await page.getByText("Hello from the mock assistant.").hover();
  await page.getByRole("button", { name: "Regenerate response" }).click();

  // The mock replies with the same greeting, so the proof of a rollback is
  // the message COUNT staying stable while the assistant row is replaced.
  await expect
    .poll(
      async () => {
        const rows = await threadMessageRows(marker);
        const assistantRows = rows.filter((row) => row.role === "assistant");
        if (
          rows.length === 2 &&
          assistantRows.length === 1 &&
          assistantRows[0]?.id !== beforeAssistantId
        ) {
          return "replaced";
        }
        return `rows=${rows.length}`;
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe("replaced");

  // The transcript shows exactly one reply, not an appended duplicate.
  await expect(page.getByText("Hello from the mock assistant.")).toHaveCount(1);
});

test("regenerate is withheld while a write awaits confirmation and refused after it executes", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const token = uniqueCompanyToken();
  const card = await requestLeadCapture(page, token);

  // While the plan is pending, no message offers Regenerate.
  await expect(
    page.getByRole("button", { name: "Regenerate response" })
  ).toHaveCount(0);

  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card.getByRole("status")).toHaveText("Approved");
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(token), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("executed");

  // The executed write must never be silently re-runnable. Whether or not the
  // closing turn offers the button, a regenerate of this exchange is refused
  // server-side and the audit trail stays executed.
  const regenerate = page.getByRole("button", {
    name: "Regenerate response",
  });
  if (await regenerate.isVisible()) {
    await page.getByText("Mock summary: all done here.").hover();
    await regenerate.click();
    await expect(page.getByText(ALREADY_RESOLVED_PATTERN)).toBeVisible({
      timeout: RESPONSE_TIMEOUT_MS,
    });
  }
  expect(await auditStatusForToken(token)).toBe("executed");
  await page.goto("/inbox");
  await expect(page.getByText(token).first()).toBeVisible();
});

test("a knowledge answer cites its sources with From chips", async ({
  page,
}) => {
  const token = uniqueCompanyToken();
  const docId = randomUUID();
  const docTitle = `E2E Deposit Policy ${token}`;
  // Seeded corpus row the FTS retriever can find via the mock's query, which
  // echoes the token. Cleaned up in finally (chunk cascades from the doc).
  const content = `Deposit terms: Blu Builders requires a fifty percent deposit before fabrication. Reference ${token}.`;
  await queryRows(
    "insert into knowledge_doc (id, slug, title, content) values ($1, $2, $3, $4)",
    [docId, `e2e-deposit-${token}`, docTitle, content]
  );
  await queryRows(
    "insert into knowledge_chunk (id, doc_id, heading, content, position) values ($1, $2, $3, $4, 0)",
    [randomUUID(), docId, "Deposits", content]
  );

  try {
    await page.goto("/");
    await skipUnlessAssistantConfigured(page, test);

    await openAssistant(page);
    await askAssistant(page, `What is our deposit policy? ${token}`);

    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Searching the knowledge base" })
    ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
    await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
      timeout: RESPONSE_TIMEOUT_MS,
    });

    // Source attribution chips name the doc the passage came from.
    await expect(page.getByText("From:")).toBeVisible();
    await expect(page.getByText(docTitle, { exact: false })).toBeVisible();
  } finally {
    await queryRows("delete from knowledge_doc where id = $1", [docId]);
  }
});

test("a resumed thread re-renders its artifact cards, not just text", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const marker = `RESART-${stamp}`;
  const companyName = `Resume Artifact Co ${stamp}`;
  const enquiry = await request.post("/api/enquiries", {
    data: {
      company: companyName,
      email: "resume-artifact@example.com",
      message: "Resume artifact fixture lead",
      name: `Resume Artifact ${stamp}`,
    },
  });
  expect(enquiry.ok()).toBeTruthy();

  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  await openAssistant(page);
  await askAssistant(page, `${marker} what is in the inbox?`);
  const artifact = page.locator(
    'section[aria-label="Inbox: unassigned leads"]'
  );
  await expect(artifact).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(artifact.getByText(companyName).first()).toBeVisible();

  // Reload wipes the client runtime; the card must come back from the
  // persisted chat_artifact rows when the thread resumes.
  await page.reload();
  await openAssistant(page);
  await page.getByRole("button", { name: "Conversation history" }).click();
  await page
    .getByRole("button", { name: new RegExp(marker) })
    .first()
    .click();

  const resumedArtifact = page.locator(
    'section[aria-label="Inbox: unassigned leads"]'
  );
  await expect(resumedArtifact).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(resumedArtifact.getByText(companyName).first()).toBeVisible();
});

test("a pending confirmation survives a reload and is still actionable on resume", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const token = uniqueCompanyToken();
  await requestLeadCapture(page, token);
  await expect
    .poll(() => auditStatusForToken(token), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("proposed");

  // Reload BEFORE confirming: the plan lives server-side on the thread.
  await page.reload();
  await openAssistant(page);
  await page.getByRole("button", { name: "Conversation history" }).click();
  await page
    .getByRole("button", { name: new RegExp(token) })
    .first()
    .click();

  // The card re-seeds from the thread's pendingToolUses and stays actionable.
  const card = page.locator('section[aria-label="Confirm: Create a new lead"]');
  await expect(card).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(card.getByLabel("company name")).toHaveValue(token);
  await card.getByRole("button", { name: "Confirm" }).click();

  await expect(card.getByRole("status")).toHaveText("Approved");
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(token), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("executed");
});

test("history rows can be renamed, pinned, and soft-deleted", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const marker = `THREAD-${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await openAssistant(page);
  await askAssistant(page, `${marker} hello`);
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  await page.getByRole("button", { name: "Conversation history" }).click();
  const menuFor = (title: string) =>
    page.getByRole("button", { name: new RegExp(`Options for.*${title}`) });

  // Rename: inline input, Enter saves, the row shows the new title.
  await menuFor(marker).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renamed = `${marker} renamed`;
  await page.getByRole("textbox", { name: "Conversation title" }).fill(renamed);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: new RegExp(renamed) }).first()
  ).toBeVisible();

  // Pin: the thread moves under a "Pinned" heading.
  await menuFor(renamed).click();
  await page.getByRole("menuitem", { name: "Pin" }).click();
  const pinnedSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Pinned" }) });
  await expect(pinnedSection).toBeVisible();
  await expect(
    pinnedSection.getByRole("button", { name: new RegExp(renamed) }).first()
  ).toBeVisible();

  // Delete: confirmation dialog, then the row disappears. Deleting the OPEN
  // thread starts a new chat, so the panel returns to the welcome state.
  await menuFor(renamed).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(
    page.getByRole("heading", { name: "Delete conversation?" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByText("Ask about the pipeline", { exact: false })
  ).toBeVisible();
  await expect(page.getByText("Hello from the mock assistant.")).toHaveCount(0);

  // Soft delete: the row is archived, not destroyed.
  await expect
    .poll(
      async () => {
        const rows = await queryRows<{ archived: string | null }>(
          "select archived_at::text as archived from chat_thread where title like $1",
          [`%${renamed}%`]
        );
        if (rows.length !== 1) {
          return `rows=${rows.length}`;
        }
        return rows[0]?.archived ? "archived" : "live";
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe("archived");
});

test("history view with a row menu open has no WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const marker = `AXE-${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await openAssistant(page);
  await askAssistant(page, `${marker} hello`);
  await expect(page.getByText("Hello from the mock assistant.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  await page.getByRole("button", { name: "Conversation history" }).click();
  await page
    .getByRole("button", { name: new RegExp(`Options for.*${marker}`) })
    .click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();

  // The dropdown portals to the body, so it is scanned alongside the panel.
  // Base UI wraps open popups in visually hidden focus-guard sentinels
  // (role="button", no name) that axe flags on WebKit; they are library
  // internals users never reach, so they are excluded rather than "fixed".
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .include(ASSISTANT_PANEL)
    .include('[role="menu"]')
    .exclude("[data-base-ui-focus-guard]")
    .analyze();
  expect(results.violations).toEqual([]);
});

test("the deal page Ask AI button prefills the composer without sending", async ({
  page,
  request,
}) => {
  const token = uniqueCompanyToken();
  const enquiry = await request.post("/api/enquiries", {
    data: {
      company: `Ask AI Co ${token}`,
      email: "ask-ai@example.com",
      message: "Ask AI fixture lead",
      name: "Ask AI Test",
    },
  });
  expect(enquiry.ok()).toBeTruthy();
  const deals = await queryRows<{ id: string }>(
    "select id from deal where title like $1 order by created_at desc limit 1",
    [`%${token}%`]
  );
  const dealId = deals[0]?.id;
  expect(dealId).toBeTruthy();

  await page.goto(`/deals/${dealId}`);
  await page.getByRole("button", { name: "Ask AI" }).click();

  // The dock opens with a prepared prompt staged in the composer; nothing is
  // sent until the user reviews it.
  const panel = page.locator(ASSISTANT_PANEL);
  await expect(panel).not.toHaveAttribute("inert");
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" })
  ).toHaveValue(ASK_AI_PREFILL_PATTERN);
  await expect(
    page.getByText("Ask about the pipeline", { exact: false })
  ).toBeVisible();
  await expect(page.getByText("Hello from the mock assistant.")).toHaveCount(0);
});

test("Cmd/Ctrl+J toggles the assistant dock", async ({ page }) => {
  await page.goto("/");

  const panel = page.locator(ASSISTANT_PANEL);
  await expect(panel).toHaveAttribute("inert", "");

  // A press can race hydration (the shortcut listener attaches client-side);
  // a pre-hydration press is a no-op, so retrying until the dock opens is
  // safe and cannot double-toggle.
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+j");
    await expect(panel).not.toHaveAttribute("inert", { timeout: 1000 });
  }).toPass();

  await page.keyboard.press("ControlOrMeta+j");
  await expect(panel).toHaveAttribute("inert", "");
});

test("the phone More menu opens the assistant", async ({ page, viewport }) => {
  test.skip(
    !viewport || viewport.width >= 768,
    "bottom tab bar is a phone-only surface"
  );
  await page.goto("/");

  // Clicks can race hydration on a fresh nav, so retry until the menu opens.
  await expect(async () => {
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Assistant" })).toBeVisible(
      { timeout: 2000 }
    );
  }).toPass();
  await page.getByRole("menuitem", { name: "Assistant" }).click();

  await expect(page.locator(ASSISTANT_PANEL)).not.toHaveAttribute("inert");
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" })
  ).toBeVisible();
});

test("the transcribe endpoint rejects anonymous and malformed requests", async ({
  request,
}) => {
  // No session: 401 before anything else is looked at. storageState is
  // pinned to empty so the suite's signed-in state can never leak in.
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const anonymous = await playwrightRequest.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const unauthenticated = await anonymous.post("/api/chat/transcribe", {
      multipart: {
        audio: {
          buffer: Buffer.from("fake-audio"),
          mimeType: "audio/webm",
          name: "note.webm",
        },
      },
    });
    expect(unauthenticated.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }

  // Signed in but no audio field: 400.
  const missingAudio = await request.post("/api/chat/transcribe", {
    multipart: {},
  });
  expect(missingAudio.status()).toBe(400);
});

test("a voice note lands its transcript in the composer without sending", async ({
  browserName,
  page,
}) => {
  // Playwright's WebKit build does not honour the getUserMedia stub (the mic
  // path throws and the recording UI never appears), so this flow is only
  // verifiable on Chromium-based projects.
  test.skip(
    browserName === "webkit",
    "getUserMedia cannot be stubbed in the WebKit test build"
  );
  const transcript = "What is in the inbox";
  // Recording needs a microphone; feed MediaRecorder a synthesized silent
  // stream so no real device or permission prompt is involved.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => {
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      return Promise.resolve(destination.stream);
    };
  });
  await page.route("**/api/chat/transcribe", (route) =>
    route.fulfill({
      body: JSON.stringify({ text: transcript }),
      contentType: "application/json",
      status: 200,
    })
  );

  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  // The mic button hides itself where MediaRecorder does not exist.
  const recorderAvailable = await page.evaluate(
    () => typeof MediaRecorder !== "undefined"
  );
  test.skip(
    !recorderAvailable,
    "MediaRecorder is unavailable in this browser build"
  );

  await openAssistant(page);
  await page.getByRole("button", { name: "Record a voice note" }).click();
  const stopButton = page.getByRole("button", { name: STOP_RECORDING_PATTERN });
  await expect(stopButton).toBeVisible();
  await stopButton.click();

  // The transcript is staged for review, never auto-sent.
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" })
  ).toHaveValue(new RegExp(transcript), { timeout: RESPONSE_TIMEOUT_MS });
  await expect(
    page.getByText("Ask about the pipeline", { exact: false })
  ).toBeVisible();
  await expect(page.getByText("Mock summary: all done here.")).toHaveCount(0);
});
