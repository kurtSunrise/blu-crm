import { expect, type Page, test } from "@playwright/test";
import { queryRows, readEnvValue } from "./test-db";

// Knowledge base admin (Assistant v3 Phase 4): /settings/knowledge lets an
// admin create, edit, and delete the docs the assistant's
// search_knowledge_base tool retrieves from. Saving re-chunks (and re-embeds
// when the AI binding exists; FTS works regardless), so a new doc must be
// searchable on the very next assistant answer. Non-admins get a read-only
// admins-only panel. The suite signs in as the seeded admin (Kurt); the
// non-admin test signs in as Jess (sales) in its own context.

const RESPONSE_TIMEOUT_MS = 20_000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const SECTIONS_STATUS_PATTERN = /\d+ sections?, \d+ embedded/;
const SAVED_TOAST_PATTERN = /Saved: \d+ sections?, \d+ embedded/;
const THREE_SECTIONS_PATTERN = /3 sections/;
const ASSISTANT_BUTTON_NAME = /assistant/i;

const uniqueToken = (): string =>
  `UNIQ-${Date.now()}${Math.floor(Math.random() * 1000)}`;

const deleteDocsByToken = async (token: string): Promise<void> => {
  // knowledge_chunk cascades from the doc row.
  await queryRows("delete from knowledge_doc where title like $1", [
    `%${token}%`,
  ]);
};

const createDocViaUi = async (
  page: Page,
  doc: { category: string; content: string; title: string }
): Promise<void> => {
  await page.getByRole("button", { name: "New document" }).click();
  await page.getByLabel("Title").fill(doc.title);
  await page.getByLabel("Category (optional)").fill(doc.category);
  await page.getByLabel("Content (markdown)").fill(doc.content);
  await page.getByRole("button", { name: "Save document" }).click();
  await expect(page.getByText(SAVED_TOAST_PATTERN)).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
};

test("an admin can create, edit, and delete a knowledge document", async ({
  page,
}) => {
  const token = uniqueToken();
  const title = `E2E Knowledge Doc ${token}`;

  try {
    await page.goto("/settings/knowledge");
    await expect(
      page.getByRole("heading", { name: "Knowledge base" })
    ).toBeVisible();

    // Create: intro plus one "## heading" section chunks into two sections.
    await createDocViaUi(page, {
      category: "e2e-test",
      content: `Intro paragraph for the e2e knowledge doc. Reference ${token}.\n\n## First topic\nDetails about the first topic ${token}.`,
      title,
    });

    // The list row shows the doc with its sections/embedded status line.
    const row = page.locator("li").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByText(SECTIONS_STATUS_PATTERN)).toBeVisible();
    await expect(row.getByText("e2e-test")).toBeVisible();

    // The slug was derived from the title at creation.
    const docs = await queryRows<{ id: string; slug: string }>(
      "select id, slug from knowledge_doc where title = $1",
      [title]
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]?.slug).toBe(`e2e-knowledge-doc-${token.toLowerCase()}`);

    // Edit: adding a second "## heading" re-chunks the doc, and the row's
    // section count reflects it after the refresh.
    await row.getByRole("button", { name: `Edit ${title}` }).click();
    const contentField = page.getByLabel("Content (markdown)");
    await expect(contentField).toHaveValue(new RegExp(token));
    await contentField.fill(
      `Intro paragraph for the e2e knowledge doc. Reference ${token}.\n\n## First topic\nDetails about the first topic ${token}.\n\n## Second topic\nDetails about the second topic ${token}.`
    );
    await page.getByRole("button", { name: "Save document" }).click();
    await expect(page.getByText(SAVED_TOAST_PATTERN).last()).toBeVisible({
      timeout: RESPONSE_TIMEOUT_MS,
    });
    await expect(row.getByText(THREE_SECTIONS_PATTERN)).toBeVisible({
      timeout: RESPONSE_TIMEOUT_MS,
    });
    await expect
      .poll(
        async () =>
          (
            await queryRows(
              "select id from knowledge_chunk where doc_id = $1",
              [docs[0]?.id]
            )
          ).length,
        { timeout: RESPONSE_TIMEOUT_MS }
      )
      .toBe(3);

    // Delete is two-step: the first tap asks, the second commits.
    await row.getByRole("button", { name: `Delete ${title}` }).click();
    await expect(
      row.getByText("Delete this document?", { exact: false })
    ).toBeVisible();
    await row.getByRole("button", { exact: true, name: "Delete" }).click();
    await expect(page.getByText("Document deleted")).toBeVisible({
      timeout: RESPONSE_TIMEOUT_MS,
    });
    await expect(row).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (
            await queryRows("select id from knowledge_doc where title = $1", [
              title,
            ])
          ).length,
        { timeout: RESPONSE_TIMEOUT_MS }
      )
      .toBe(0);
  } finally {
    await deleteDocsByToken(token);
  }
});

test("a non-admin sees the admins-only panel instead of the editor", async ({
  browser,
}) => {
  // A clean context signed in as the seeded sales user (not the suite's
  // admin storage state).
  const context = await browser.newContext({ baseURL: BASE_URL });
  try {
    const signIn = await context.request.post("/api/auth/sign-in/email", {
      data: {
        email: "jess@blu.builders",
        password: readEnvValue("SEED_USER_PASSWORD") ?? "blu-crm-dev",
      },
      // Better Auth rejects origin-less credential sign-ins with 403
      // MISSING_OR_NULL_ORIGIN; a browser context's request client does not
      // add one on its own the way a page fetch would.
      headers: { origin: BASE_URL },
    });
    expect(
      signIn.status(),
      `jess@blu.builders sign-in replied ${signIn.status()}: ${await signIn.text()}`
    ).toBe(200);

    const page = await context.newPage();
    await page.goto("/settings/knowledge");
    await expect(
      page.getByText("Admins only. Ask an admin to change the knowledge base.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New document" })
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

// Mirrors the helpers in ai-assistant.spec.ts: the assistant panel plus the
// mocked-model guard.
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

test("a newly saved document is searchable by the assistant straight away", async ({
  page,
}) => {
  const token = uniqueToken();
  const title = `E2E Fresh Policy ${token}`;

  try {
    await page.goto("/settings/knowledge");
    await skipUnlessAssistantConfigured(page, test);
    // Content mirrors the proven knowledge-citation fixture wording so the
    // mock's echoed FTS query ("deposit terms <token>") matches it.
    await createDocViaUi(page, {
      category: "e2e-test",
      content: `Deposit terms: Blu Builders requires a fifty percent deposit before fabrication. Reference ${token}.`,
      title,
    });

    // No import step, no restart: the very next assistant answer must find
    // the doc (FTS at minimum; embeddings only refine ranking).
    await openAssistant(page);
    await page
      .getByRole("textbox", { name: "Message the assistant" })
      .fill(`What is our deposit policy? ${token}`);
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Searching the knowledge base" })
    ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
    await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
      timeout: RESPONSE_TIMEOUT_MS,
    });

    // Source attribution names the just-created doc.
    await expect(page.getByText("From:")).toBeVisible();
    await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
  } finally {
    await deleteDocsByToken(token);
  }
});
