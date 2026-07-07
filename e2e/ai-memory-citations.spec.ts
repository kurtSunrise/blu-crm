import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { queryRows } from "./test-db";

// Assistant v3 Phase 3: cross-thread memory (the save_memory tool executes
// inline, renders a "Memory saved" chip with Undo, injects into future
// prompts, and is reviewable in Settings) and native knowledge citations
// (inline " [N]" markers plus a numbered Sources list that supersedes the
// flat "From:" chips). The Anthropic API is replaced by
// e2e/mock-anthropic-server.ts via ANTHROPIC_BASE_URL; scenario triggers:
// /remember|save.*memory/i and /cite|policy question/i.

const RESPONSE_TIMEOUT_MS = 20_000;
const ASSISTANT_BUTTON_NAME = /assistant/i;
const ASSISTANT_PANEL = 'aside[aria-label="Blu assistant"]';
// The mock echoes the run token into save_memory's content, so the chip and
// the assistant_memory row are both uniquely findable per run.
const MEMORY_CONTENT_PREFIX = "Jess prefers SMS follow-ups for Bunnings leads";
// The scripted citations_delta carries this source card (see the mock's
// CITATIONS_DELTA_EVENT); the loop numbers it [1].
const CITATION_TITLE = "Brand voice § Tone";
const CITATION_SNIPPET_PATTERN = /Blu is The Creative Build Company/;
const INLINE_MARKER_PATTERN = /\[1\]/;
const SCOPE_BADGE_PATTERN = /^(Team-wide|Yours)$/;

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

// Each run gets a token the mock echoes back (matches /UNIQ-\d+/), so
// parallel projects sharing one DB never collide, and the 13-digit
// timestamp keeps every written row sweepable (see test-data-sweep).
const uniqueToken = (): string =>
  `UNIQ-${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Resumes the one thread whose title carries the marker, from a fresh
// assistant panel (post-reload).
const resumeThreadByMarker = async (
  page: Page,
  marker: string
): Promise<void> => {
  await openAssistant(page);
  await page.getByRole("button", { name: "Conversation history" }).click();
  await page
    .getByRole("button", { name: new RegExp(marker) })
    .first()
    .click();
};

// Latest assistant_memory row carrying this run's token in its content.
const memoryRowForToken = async (
  token: string
): Promise<{ disabled: string | null; userId: string | null } | null> => {
  const rows = await queryRows<{
    disabled: string | null;
    user_id: string | null;
  }>(
    `select disabled_at::text as disabled, user_id from assistant_memory
     where content like $1 order by created_at desc limit 1`,
    [`%${token}%`]
  );
  const row = rows[0];
  return row ? { disabled: row.disabled, userId: row.user_id } : null;
};

test("an auto-saved memory renders a chip, Undo disables the row, and the chip survives resume", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const token = uniqueToken();
  await openAssistant(page);
  await askAssistant(
    page,
    `${token} remember that Jess prefers SMS for Bunnings leads`
  );

  // save_memory runs inline (no confirmation card): the live activity chip
  // shows, then the "Memory saved" chip renders with the saved content and
  // its Undo, and the turn closes with text.
  await expect(
    page.getByRole("status").filter({ hasText: "Saving a memory" })
  ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(page.getByText("Memory saved", { exact: true })).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(
    page.getByText(`${MEMORY_CONTENT_PREFIX} (${token})`)
  ).toBeVisible();
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  // No confirmation card was involved anywhere in the turn.
  await expect(page.locator('section[aria-label^="Confirm:"]')).toHaveCount(0);

  // The memory is a real, active row scoped to the signed-in user, and the
  // inline execution still landed an "executed" audit row.
  await expect
    .poll(
      async () => {
        const row = await memoryRowForToken(token);
        if (!row) {
          return "missing";
        }
        return row.disabled ? "disabled" : "active";
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe("active");
  expect((await memoryRowForToken(token))?.userId).toBeTruthy();
  const audit = await queryRows<{ status: string }>(
    `select status from ai_audit_log
     where tool_name = 'save_memory' and input::text like $1
     order by created_at desc limit 1`,
    [`%${token}%`]
  );
  expect(audit[0]?.status).toBe("executed");

  // Undo swaps the chip to its removed state and soft-disables the row.
  await page.getByRole("button", { name: "Undo saved memory" }).click();
  await expect(page.getByText("Memory removed", { exact: false })).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(async () => (await memoryRowForToken(token))?.disabled ?? "missing", {
      timeout: RESPONSE_TIMEOUT_MS,
    })
    .not.toBe("missing");
  expect((await memoryRowForToken(token))?.disabled).toBeTruthy();

  // Reload wipes the client runtime; the chip must come back from the
  // persisted memory_saved artifact when the thread resumes (the row is
  // disabled server-side, so any rendered state of the chip is acceptable —
  // the assertion is that it renders at all).
  await page.reload();
  await resumeThreadByMarker(page, token);
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect(
    page.getByText(`${MEMORY_CONTENT_PREFIX} (${token})`)
  ).toBeVisible();
});

test("the account settings page shows the Assistant memory section", async ({
  page,
}) => {
  await page.goto("/settings/account");

  await expect(
    page.getByRole("heading", { name: "Assistant memory" })
  ).toBeVisible();
  // The shared DB may or may not hold rows from other runs, so the section
  // body is one of two valid states: the empty-state copy or a scoped list
  // (every row carries a Team-wide / Yours badge).
  const emptyState = page.getByText("Nothing remembered yet", {
    exact: false,
  });
  const scopeBadge = page.getByText(SCOPE_BADGE_PATTERN).first();
  await expect(emptyState.or(scopeBadge).first()).toBeVisible();
});

test("an admin can add, edit, and two-step delete a team-wide memory in AI settings", async ({
  page,
}) => {
  // The stamp doubles as the sweep hook (13-digit timestamp in content).
  const stamp = Date.now();
  const content = `Always quote sheds in AUD including GST ${stamp}`;
  const edited = `Always quote sheds in AUD including GST ${stamp} and flag freight`;
  const row = page.locator("li").filter({ hasText: `${stamp}` });

  await page.goto("/settings/ai");
  await expect(
    page.getByRole("heading", { name: "Assistant memory" })
  ).toBeVisible();

  // Add via the admin-only composer; the list is server-rendered, so the row
  // appears after the refresh with its Team-wide scope badge.
  await page.getByLabel("Add team-wide memory").fill(content);
  await page.getByRole("button", { name: "Add memory" }).click();
  await expect(row).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(row.getByText("Team-wide")).toBeVisible();
  const created = await queryRows<{ user_id: string | null }>(
    "select user_id from assistant_memory where content = $1 and disabled_at is null",
    [content]
  );
  expect(created).toHaveLength(1);
  expect(created[0]?.user_id).toBeNull();

  // Inline edit rewrites the content in place.
  await row.getByRole("button", { name: "Edit memory" }).click();
  await row.getByRole("textbox", { name: "Memory text" }).fill(edited);
  await row.getByRole("button", { exact: true, name: "Save" }).click();
  await expect(row.getByText(edited)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(
      async () => {
        const rows = await queryRows<{ n: string }>(
          "select count(*)::int::text as n from assistant_memory where content = $1 and disabled_at is null",
          [edited]
        );
        return rows[0]?.n ?? "0";
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe("1");

  // Delete is two-step: the first tap only asks, the second commits, and the
  // row disappears from the list (a soft disable server-side).
  await row.getByRole("button", { name: "Delete memory" }).click();
  await expect(row.getByText("Delete this memory?")).toBeVisible();
  await row.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(row).toHaveCount(0, { timeout: RESPONSE_TIMEOUT_MS });
  await expect
    .poll(
      async () => {
        const rows = await queryRows<{ disabled: string | null }>(
          "select disabled_at::text as disabled from assistant_memory where content = $1",
          [edited]
        );
        return rows[0]?.disabled ? "disabled" : "active";
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe("disabled");
});

test("a cited knowledge answer numbers its sources inline and suppresses the flat chips, surviving resume", async ({
  page,
}) => {
  const token = uniqueToken();
  const docId = randomUUID();
  // Seeded corpus row so the real search_knowledge_base call (first half of
  // the mock's citations scenario) finds a passage and emits a flat sources
  // artifact — the thing the numbered citations must suppress. Cleaned up in
  // finally (the chunk cascades from the doc).
  const docContent = `Brand voice guidance: Blu is The Creative Build Company, warm and confident, never salesy. Reference ${token}.`;
  await queryRows(
    "insert into knowledge_doc (id, slug, title, content) values ($1, $2, $3, $4)",
    [docId, `e2e-brand-voice-${token}`, `E2E Brand Voice ${token}`, docContent]
  );
  await queryRows(
    "insert into knowledge_chunk (id, doc_id, heading, content, position) values ($1, $2, $3, $4, 0)",
    [randomUUID(), docId, "Tone", docContent]
  );

  try {
    await page.goto("/");
    await skipUnlessAssistantConfigured(page, test);

    await openAssistant(page);
    await askAssistant(page, `${token} answer my policy question, with cites`);
    const panel = page.locator(ASSISTANT_PANEL);

    // The knowledge tool runs for real, then the scripted stream answers
    // with a citations_delta: the loop injects the inline " [1]" marker into
    // the sentence as it streams.
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Searching the knowledge base" })
    ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
    await expect(
      panel.getByText("lead with warmth", { exact: false }).first()
    ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
    await expect(panel.getByText(INLINE_MARKER_PATTERN).first()).toBeVisible();

    // The numbered Sources list renders the card the marker points at, and
    // the row expands in place to the quoted snippet.
    await expect(panel.getByText("Sources", { exact: true })).toBeVisible();
    const sourceRow = panel.getByRole("button", {
      name: new RegExp(`1\\..*${CITATION_TITLE}`),
    });
    await expect(sourceRow).toBeVisible();
    await expect(sourceRow).toHaveAttribute("aria-expanded", "false");
    await sourceRow.click();
    await expect(sourceRow).toHaveAttribute("aria-expanded", "true");
    await expect(
      panel.getByText(CITATION_SNIPPET_PATTERN).first()
    ).toBeVisible();

    // Suppression is real, not vacuous: the flat sources artifact exists on
    // the turn (the knowledge search found the seeded doc), but the "From:"
    // chips must not render alongside numbered citations.
    await expect
      .poll(
        async () => {
          const rows = await queryRows<{ n: string }>(
            `select count(*)::int::text as n from chat_artifact a
             join chat_thread t on a.thread_id = t.id
             where t.title like $1 and a.artifact_type = 'sources'`,
            [`%${token}%`]
          );
          return rows[0]?.n ?? "0";
        },
        { timeout: RESPONSE_TIMEOUT_MS }
      )
      .toBe("1");
    await expect(panel.getByText("From:")).toHaveCount(0);

    // Reload wipes the client runtime; on resume the marker is re-injected
    // into the persisted text and the Sources list re-renders from
    // DisplayMessage.citations, still suppressing the chips.
    await page.reload();
    await resumeThreadByMarker(page, token);
    await expect(
      panel.getByText("lead with warmth", { exact: false }).first()
    ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
    await expect(panel.getByText(INLINE_MARKER_PATTERN).first()).toBeVisible();
    await expect(panel.getByText("Sources", { exact: true })).toBeVisible();
    const resumedRow = panel.getByRole("button", {
      name: new RegExp(`1\\..*${CITATION_TITLE}`),
    });
    await expect(resumedRow).toBeVisible();
    await resumedRow.click();
    await expect(resumedRow).toHaveAttribute("aria-expanded", "true");
    await expect(
      panel.getByText(CITATION_SNIPPET_PATTERN).first()
    ).toBeVisible();
    await expect(panel.getByText("From:")).toHaveCount(0);
  } finally {
    await queryRows("delete from knowledge_doc where id = $1", [docId]);
  }
});
