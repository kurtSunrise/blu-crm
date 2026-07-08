import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  request as playwrightRequest,
  test,
} from "@playwright/test";
import { queryRows } from "./test-db";

// Assistant v3 Phase 4: edit + resubmit of the last user turn, thread
// compaction (Haiku summary via the mock's non-streaming branch), voice-note
// retention and filing (log_activity audioAttachmentId), the composer's
// slash palette and @-mention menu, Copy as Markdown, and the
// /api/chat/entity-search route. The Anthropic API is replaced by
// e2e/mock-anthropic-server.ts (ANTHROPIC_BASE_URL), which also records the
// text of every request at GET /__requests so specs can assert what actually
// reached the model.

const RESPONSE_TIMEOUT_MS = 20_000;
const MOCK_SERVER_URL = "http://127.0.0.1:4848";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ASSISTANT_BUTTON_NAME = /assistant/i;
const ASSISTANT_PANEL = 'aside[aria-label="Blu assistant"]';
const GREETING_TEXT = "Hello from the mock assistant.";
const CLOSING_TEXT = "Mock summary: all done here.";
// The exact 409 copy from guardEdit in src/app/api/chat/route.ts.
const EDIT_REFUSED_PATTERN =
  /This part of the conversation made changes and cannot be edited/;
// The non-streaming reply hardcoded in the mock; compaction persists it.
const COMPACTION_SUMMARY_TEXT =
  "Mock compaction summary of the earlier conversation.";
const STOP_RECORDING_PATTERN = /Stop recording/;
const FILE_VOICE_NOTE_PATTERN = /File this voice note/;
const LEAD_ID_PREFIX_PATTERN = /^BLU-/;

// 1x1 red pixel PNG, reused from the attachment fixtures. The voice-note
// tests upload it through the real /api/chat/attachments route (so a real R2
// object exists for the filing copy) and then flip the row's content type to
// audio, which is the only part the transcribe route would have done
// differently.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const uniqueToken = (): string =>
  `UNIQ-${Date.now()}${Math.floor(Math.random() * 1000)}`;

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

// All messages of the one thread carrying this marker in its title.
const threadMessageRows = async (
  marker: string
): Promise<{ content: string; id: string; role: string }[]> =>
  await queryRows<{ content: string; id: string; role: string }>(
    `select m.id, m.role, m.content::text as content from chat_message m
     join chat_thread t on m.thread_id = t.id
     where t.title like $1
     order by m.created_at asc`,
    [`%${marker}%`]
  );

// ---------------------------------------------------------------------------
// Edit + resubmit
// ---------------------------------------------------------------------------

test("editing the last user message re-runs the tail and replaces the reply", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const marker = `EDIT-${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await openAssistant(page);
  await askAssistant(page, `${marker} hello`);
  await expect(page.getByText(GREETING_TEXT)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(async () => (await threadMessageRows(marker)).length, {
      timeout: RESPONSE_TIMEOUT_MS,
    })
    .toBe(2);

  // The pencil fades in on hover devices; touch keeps it visible.
  await page.getByText(`${marker} hello`).hover();
  await page.getByRole("button", { name: "Edit message" }).click();

  // The bubble swaps to a textarea prefilled with the original text. Sending
  // a different trigger phrase re-runs the tail under a new mock scenario, so
  // a changed reply proves the edited text (not the original) was answered.
  const editor = page.getByRole("textbox", { name: "Edit your message" });
  await expect(editor).toHaveValue(`${marker} hello`);
  await editor.fill("Take a moment to think, then reply");
  await page.getByRole("button", { exact: true, name: "Send" }).click();

  await expect(page.getByText("Here is the considered answer.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  // The old exchange is gone, not appended to.
  await expect(page.getByText(GREETING_TEXT)).toHaveCount(0);

  // Server-side the turn was replaced: still one user + one assistant row,
  // and the user row carries the edited text.
  await expect
    .poll(
      async () => {
        const rows = await threadMessageRows(marker);
        const user = rows.filter((row) => row.role === "user");
        if (
          rows.length === 2 &&
          user.length === 1 &&
          user[0]?.content.includes("Take a moment to think")
        ) {
          return "replaced";
        }
        return `rows=${rows.length}`;
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe("replaced");
});

// Latest audit row for the create_lead proposal carrying this token.
const auditStatusForToken = async (token: string): Promise<string | null> => {
  const rows = await queryRows<{ status: string }>(
    `select status from ai_audit_log
     where tool_name = 'create_lead' and input::text like $1
     order by created_at desc limit 1`,
    [`%${token}%`]
  );
  return rows[0]?.status ?? null;
};

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
  return card;
};

test("edit is withheld while a write awaits confirmation and refused after it executes", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const token = uniqueToken();
  const card = await requestLeadCapture(page, token);

  // While the plan is pending, no user message offers the pencil.
  await expect(page.getByRole("button", { name: "Edit message" })).toHaveCount(
    0
  );

  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card.getByRole("status")).toHaveText("Approved");
  await expect(page.getByText(CLOSING_TEXT)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(token), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("executed");

  const messagesBefore = (await threadMessageRows(token)).length;
  expect(messagesBefore).toBeGreaterThan(0);

  // The last user message is now the "Approve" turn; editing it would roll
  // back past the executed write, so the server must refuse with its 409 copy
  // and leave the persisted transcript untouched.
  await page.getByText("Approve", { exact: true }).hover();
  await page.getByRole("button", { name: "Edit message" }).click();
  const editor = page.getByRole("textbox", { name: "Edit your message" });
  await editor.fill(`Actually change the company to ${uniqueToken()}`);
  await page.getByRole("button", { exact: true, name: "Send" }).click();

  await expect(page.getByText(EDIT_REFUSED_PATTERN)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  expect(await auditStatusForToken(token)).toBe("executed");
  expect((await threadMessageRows(token)).length).toBe(messagesBefore);
  // The executed lead is still real.
  await page.goto("/inbox");
  await expect(page.getByText(token).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Thread compaction
// ---------------------------------------------------------------------------

test("a long thread compacts after a turn and the next request replays the summary", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const marker = `COMPACT-${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await openAssistant(page);
  await askAssistant(page, `${marker} hello`);
  await expect(page.getByText(GREETING_TEXT)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  const threads = await queryRows<{ id: string }>(
    "select id from chat_thread where title like $1 limit 1",
    [`%${marker}%`]
  );
  const threadId = threads[0]?.id;
  expect(threadId).toBeTruthy();

  // Backfill 44 plain filler turns (oldest first) so the thread crosses both
  // the 30-message compaction threshold and the 40-row replay cap. Wording
  // deliberately avoids every mock scenario trigger.
  await queryRows(
    `insert into chat_message (id, thread_id, role, content, created_at)
     select gen_random_uuid()::text, $1,
            (case when g % 2 = 1 then 'user' else 'assistant' end)::chat_message_role,
            jsonb_build_array(jsonb_build_object(
              'type', 'text',
              'text', 'Filler turn ' || g || ' about workshop logistics.')),
            now() - interval '30 minutes' + (g * interval '2 seconds')
     from generate_series(1, 44) as g`,
    [threadId]
  );

  // The next successful turn triggers post-turn compaction: the mock answers
  // the summariser's non-streaming createMessage with its fixed summary text.
  await askAssistant(page, "hello again");
  await expect(page.getByText(GREETING_TEXT)).toHaveCount(2, {
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(
      async () => {
        const rows = await queryRows<{
          summary_text: string | null;
          summary_up_to: string | null;
        }>(
          "select summary_text, summary_up_to::text as summary_up_to from chat_thread where id = $1",
          [threadId]
        );
        const row = rows[0];
        if (row?.summary_text?.includes("Mock compaction summary")) {
          return row.summary_up_to ? "compacted" : "missing summary_up_to";
        }
        return "pending";
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe("compacted");

  // The following turn replays past the cap, so the request that reaches the
  // model must open with the <thread_summary> synthetic user turn. The mock
  // records request text at /__requests; the probe token isolates this turn.
  const probe = `SUMPROBE-${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await askAssistant(page, `${probe} are you keeping up?`);
  await expect(page.getByText(GREETING_TEXT)).toHaveCount(3, {
    timeout: RESPONSE_TIMEOUT_MS,
  });

  const recorded = await request.get(`${MOCK_SERVER_URL}/__requests`);
  expect(recorded.ok()).toBeTruthy();
  const { requests } = (await recorded.json()) as {
    requests: { stream: boolean; text: string }[];
  };
  const probeRequest = requests.find(
    (entry) => entry.stream && entry.text.includes(probe)
  );
  expect(probeRequest).toBeTruthy();
  expect(probeRequest?.text).toContain("<thread_summary>");
  expect(probeRequest?.text).toContain(COMPACTION_SUMMARY_TEXT);
});

// ---------------------------------------------------------------------------
// Voice-note retention and filing
// ---------------------------------------------------------------------------

// Uploads the PNG fixture through the real chat-attachment route (creating a
// real R2 object plus chat_attachment row owned by the suite user), then
// re-labels the row as audio — the one thing only the transcribe route (which
// needs the Workers AI binding) would otherwise do. Returns the attachment id.
const seedVoiceNoteAttachment = async (
  request: APIRequestContext
): Promise<string> => {
  const uploaded = await request.post("/api/chat/attachments", {
    multipart: {
      file: {
        buffer: Buffer.from(PNG_BASE64, "base64"),
        mimeType: "image/png",
        name: "voice-note-e2e.webm",
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const { id } = (await uploaded.json()) as { id: string };
  await queryRows(
    "update chat_attachment set content_type = 'audio/webm' where id = $1",
    [id]
  );
  return id;
};

// Feeds MediaRecorder a synthesized silent stream so no device or permission
// prompt is involved, mirroring the existing voice spec.
const stubMicrophone = async (page: Page): Promise<void> => {
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
};

const recordVoiceNote = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Record a voice note" }).click();
  const stopButton = page.getByRole("button", { name: STOP_RECORDING_PATTERN });
  await expect(stopButton).toBeVisible();
  await stopButton.click();
};

test("a transcribed voice note stages a chip and its audio rides the next send", async ({
  browserName,
  page,
  request,
}) => {
  test.skip(
    browserName === "webkit",
    "getUserMedia cannot be stubbed in the WebKit test build"
  );

  const attachmentId = await seedVoiceNoteAttachment(request);
  const transcript = "Just checked the site measurements";
  await stubMicrophone(page);
  await page.route("**/api/chat/transcribe", (route) =>
    route.fulfill({
      body: JSON.stringify({ attachmentId, text: transcript }),
      contentType: "application/json",
      status: 200,
    })
  );

  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  const recorderAvailable = await page.evaluate(
    () => typeof MediaRecorder !== "undefined"
  );
  test.skip(
    !recorderAvailable,
    "MediaRecorder is unavailable in this browser build"
  );

  await openAssistant(page);
  await recordVoiceNote(page);

  // Transcript staged for review, audio staged as a visible chip.
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" })
  ).toHaveValue(new RegExp(transcript), { timeout: RESPONSE_TIMEOUT_MS });
  const chip = page.locator(ASSISTANT_PANEL).getByText("Voice note attached");
  await expect(chip).toBeVisible();

  // Sending carries the retained audio id to /api/chat and clears the chip.
  const chatRequest = page.waitForRequest(
    (candidate) =>
      new URL(candidate.url()).pathname === "/api/chat" &&
      candidate.method() === "POST"
  );
  await page.getByRole("button", { name: "Send message" }).click();
  const sent = await chatRequest;
  const body = JSON.parse(sent.postData() ?? "{}") as {
    attachmentIds?: string[];
  };
  expect(body.attachmentIds).toContain(attachmentId);

  await expect(page.getByText(GREETING_TEXT)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(chip).toHaveCount(0);

  // The retained recording is a real chat_attachment row with an audio
  // content type, now claimed by the thread the send created.
  await expect
    .poll(
      async () => {
        const rows = await queryRows<{
          content_type: string;
          thread_id: string | null;
        }>(
          "select content_type, thread_id from chat_attachment where id = $1",
          [attachmentId]
        );
        const row = rows[0];
        if (!row) {
          return "missing";
        }
        if (!row.content_type.startsWith("audio/")) {
          return `type=${row.content_type}`;
        }
        return row.thread_id ? "linked" : "unlinked";
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe("linked");
});

test("filing a dictated voice note attaches the recording to the deal", async ({
  browserName,
  page,
  request,
}) => {
  test.skip(
    browserName === "webkit",
    "getUserMedia cannot be stubbed in the WebKit test build"
  );

  // A deal to file against, seeded through the public enquiry endpoint.
  const token = uniqueToken();
  const enquiry = await request.post("/api/enquiries", {
    data: {
      company: `Voice File Co ${token}`,
      email: "voice-file@example.com",
      message: "Voice filing fixture lead",
      name: `Voice File ${token}`,
    },
  });
  expect(enquiry.ok()).toBeTruthy();
  const deals = await queryRows<{ id: string; lead_id: string }>(
    "select id, lead_id from deal where title like $1 order by created_at desc limit 1",
    [`%${token}%`]
  );
  const deal = deals[0];
  expect(deal).toBeTruthy();
  if (!deal) {
    return;
  }

  const attachmentId = await seedVoiceNoteAttachment(request);
  const chatFileKeys = await queryRows<{ file_key: string }>(
    "select file_key from chat_attachment where id = $1",
    [attachmentId]
  );
  const chatFileKey = chatFileKeys[0]?.file_key;
  expect(chatFileKey).toBeTruthy();

  await stubMicrophone(page);
  await page.route("**/api/chat/transcribe", (route) =>
    route.fulfill({
      body: JSON.stringify({
        attachmentId,
        text: `File this voice note as a call on deal ${deal.lead_id}`,
      }),
      contentType: "application/json",
      status: 200,
    })
  );

  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  const recorderAvailable = await page.evaluate(
    () => typeof MediaRecorder !== "undefined"
  );
  test.skip(
    !recorderAvailable,
    "MediaRecorder is unavailable in this browser build"
  );

  await openAssistant(page);
  await recordVoiceNote(page);
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" })
  ).toHaveValue(FILE_VOICE_NOTE_PATTERN, { timeout: RESPONSE_TIMEOUT_MS });
  await expect(
    page.locator(ASSISTANT_PANEL).getByText("Voice note attached")
  ).toBeVisible();
  await page.getByRole("button", { name: "Send message" }).click();

  // The server told the model the audio id via <page_context>; the mock read
  // it back into a log_activity tool_use, which is a gated write, so the
  // input-aware confirmation card renders.
  const card = page.locator(
    'section[aria-label="Confirm: Log activity with voice note"]'
  );
  await expect(card).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card.getByRole("status")).toHaveText("Approved");
  await expect(page.getByText(CLOSING_TEXT)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  // Execution logged the call on the deal's timeline…
  await expect
    .poll(
      async () =>
        (
          await queryRows(
            "select id from activity where deal_id = $1 and type = 'call'",
            [deal.id]
          )
        ).length,
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBeGreaterThan(0);

  // …and attached the recording as a deal attachment: audio content type,
  // copied to a deal-owned R2 key rather than aliasing the chat object.
  const dealAttachments = await queryRows<{
    content_type: string | null;
    file_key: string;
  }>(
    "select content_type, file_key from attachment where deal_id = $1 order by created_at desc limit 1",
    [deal.id]
  );
  const filed = dealAttachments[0];
  expect(filed).toBeTruthy();
  expect(filed?.content_type).toBe("audio/webm");
  expect(filed?.file_key.startsWith(`deals/${deal.id}/`)).toBeTruthy();
  expect(filed?.file_key).not.toBe(chatFileKey);
});

// Feasibility probe for real retention: exercises the actual transcribe
// route end-to-end when the Workers AI binding is available in this
// environment, and skips with the reason when it is not (the deterministic
// coverage above route-mocks transcription instead).
test("the transcribe endpoint retains real audio as a chat attachment when Workers AI is available", async ({
  request,
}) => {
  // 0.25s of silent 16kHz mono PCM in a WAV container.
  const sampleRate = 16_000;
  const samples = sampleRate / 4;
  const dataSize = samples * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);

  // The dev server proxies the AI binding to remote Workers AI, which can
  // hang well past this spec's budget; a bounded client timeout turns that
  // into the same graceful skip as an explicit 502/503/504.
  let response: Awaited<ReturnType<typeof request.post>>;
  try {
    response = await request.post("/api/chat/transcribe", {
      multipart: {
        audio: { buffer: wav, mimeType: "audio/wav", name: "probe.wav" },
      },
      timeout: 15_000,
    });
  } catch {
    test.skip(
      true,
      "Workers AI transcription did not respond within 15s in this environment"
    );
    return;
  }
  test.skip(
    response.status() === 503,
    "Workers AI binding is not available in this environment"
  );
  test.skip(
    response.status() === 502 || response.status() === 504,
    "Workers AI transcription did not respond in this environment"
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as {
    attachmentId: string | null;
    text: string;
  };
  expect(typeof payload.text).toBe("string");
  expect(payload.attachmentId).toBeTruthy();

  const rows = await queryRows<{ content_type: string }>(
    "select content_type from chat_attachment where id = $1",
    [payload.attachmentId]
  );
  expect(rows[0]?.content_type).toBe("audio/wav");
});

// ---------------------------------------------------------------------------
// Composer: slash palette, @-mentions, Copy as Markdown
// ---------------------------------------------------------------------------

test("the slash palette inserts the weekly report prompt without sending", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  await openAssistant(page);

  const composer = page.getByRole("textbox", { name: "Message the assistant" });
  await composer.fill("/");
  const palette = page.getByRole("listbox", { name: "Commands" });
  await expect(palette).toBeVisible();

  // Typing narrows the list to the matching command.
  await composer.fill("/rep");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await palette.getByRole("option").filter({ hasText: "/report" }).click();

  // The pick fills the input; nothing is auto-sent.
  await expect(composer).toHaveValue("Give me this week's pipeline report");
  await expect(palette).toBeHidden();
  await expect(
    page.getByText("Ask about the pipeline", { exact: false })
  ).toBeVisible();
  await expect(
    page.locator('section[aria-label="Weekly pipeline report"]')
  ).toHaveCount(0);
  await expect(page.getByText(CLOSING_TEXT)).toHaveCount(0);
});

test("an @-mention picks a seeded deal and its id rides the send as page context", async ({
  page,
  request,
}) => {
  const token = uniqueToken();
  const enquiry = await request.post("/api/enquiries", {
    data: {
      company: `Mention Fixture Co ${token}`,
      email: "mention-e2e@example.com",
      message: "Mention menu fixture lead",
      name: `Mention Test ${token}`,
    },
  });
  expect(enquiry.ok()).toBeTruthy();
  const deals = await queryRows<{ id: string; lead_id: string }>(
    "select id, lead_id from deal where title like $1 order by created_at desc limit 1",
    [`%${token}%`]
  );
  const deal = deals[0];
  expect(deal).toBeTruthy();
  if (!deal) {
    return;
  }

  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  await openAssistant(page);

  const composer = page.getByRole("textbox", { name: "Message the assistant" });
  await composer.fill(`@${token}`);
  const menu = page.getByRole("listbox", { name: "Mention a deal or contact" });
  await expect(menu).toBeVisible();
  await menu.getByRole("option").filter({ hasText: token }).first().click();

  // The pick inserts a readable token carrying the lead id.
  await expect(composer).toHaveValue(new RegExp(`@${deal.lead_id} `));

  const chatRequest = page.waitForRequest(
    (candidate) =>
      new URL(candidate.url()).pathname === "/api/chat" &&
      candidate.method() === "POST"
  );
  await page.getByRole("button", { name: "Send message" }).click();
  const sent = await chatRequest;
  const body = JSON.parse(sent.postData() ?? "{}") as {
    pageContext?: { mentionedDealIds?: string[] };
  };
  expect(body.pageContext?.mentionedDealIds).toContain(deal.id);

  // The turn completes normally with the mention aboard.
  await expect(page.getByText(GREETING_TEXT)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
});

test("Copy as Markdown copies the conversation and reports the empty state", async ({
  browserName,
  context,
  page,
}) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);
  await openAssistant(page);

  // Nothing to copy yet: the button says so instead of copying silence.
  await page.getByRole("button", { name: "Copy as Markdown" }).click();
  await expect(
    page.getByText("Nothing to copy yet. Start a conversation first.")
  ).toBeVisible();

  const marker = `MD-${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await askAssistant(page, `${marker} hello`);
  await expect(page.getByText(GREETING_TEXT)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  await page.getByRole("button", { name: "Copy as Markdown" }).click();
  await expect(
    page.getByText("Conversation copied as Markdown.")
  ).toBeVisible();

  if (browserName === "chromium") {
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("## You");
    expect(clipboard).toContain(`${marker} hello`);
    expect(clipboard).toContain("## Assistant");
    expect(clipboard).toContain(GREETING_TEXT);
  }
});

// ---------------------------------------------------------------------------
// Entity-search route
// ---------------------------------------------------------------------------

test("the entity-search endpoint rejects anonymous requests and empties short queries", async ({
  request,
}) => {
  const anonymous = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const unauthenticated = await anonymous.get(
      "/api/chat/entity-search?q=display"
    );
    expect(unauthenticated.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }

  // Signed in but under the two-character minimum: empty result sets, no
  // wildcard table scan.
  const short = await request.get("/api/chat/entity-search?q=a");
  expect(short.status()).toBe(200);
  expect(await short.json()).toEqual({ contacts: [], deals: [] });
});

test("the entity-search endpoint finds a seeded deal by title fragment", async ({
  request,
}) => {
  const token = uniqueToken();
  const enquiry = await request.post("/api/enquiries", {
    data: {
      company: `Entity Search Co ${token}`,
      email: "entity-search@example.com",
      message: "Entity search fixture lead",
      name: `Entity Search ${token}`,
    },
  });
  expect(enquiry.ok()).toBeTruthy();

  const response = await request.get(
    `/api/chat/entity-search?q=${encodeURIComponent(token)}`
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as {
    deals: { id: string; leadId: string; title: string }[];
  };
  expect(payload.deals.length).toBeGreaterThan(0);
  expect(payload.deals[0]?.title).toContain(token);
  expect(payload.deals[0]?.leadId).toMatch(LEAD_ID_PREFIX_PATTERN);
});
