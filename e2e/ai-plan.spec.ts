import { expect, type Locator, type Page, test } from "@playwright/test";
import { queryRows } from "./test-db";

// Multi-step write plans (FR-7.8, upgraded): one assistant turn can propose
// SEVERAL gated writes. They render as a single checklist card, each item can
// be included or skipped, one Confirm resolves the whole review, and the
// route executes approved items sequentially with a per-item audit lifecycle.
// The mock's "two-step plan" scenario returns two create_lead tool_use blocks
// whose company names echo the two UNIQ tokens in the message.

const RESPONSE_TIMEOUT_MS = 20_000;
const ASSISTANT_BUTTON_NAME = /assistant/i;

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

const uniqueCompanyToken = (): string =>
  `UNIQ-${Date.now()}${Math.floor(Math.random() * 1000)}`;

interface AuditRow {
  resolvedAt: string | null;
  status: string;
}

// Latest create_lead audit row whose model-proposed input carries the token.
const auditRowForToken = async (token: string): Promise<AuditRow | null> => {
  const rows = await queryRows<{ resolved_at: string | null; status: string }>(
    `select resolved_at::text as resolved_at, status from ai_audit_log
     where tool_name = 'create_lead' and input::text like $1
     order by created_at desc limit 1`,
    [`%${token}%`]
  );
  const row = rows[0];
  return row ? { resolvedAt: row.resolved_at, status: row.status } : null;
};

const auditStatusForToken = async (token: string): Promise<string | null> =>
  (await auditRowForToken(token))?.status ?? null;

// Asks for the two-item plan and returns the checklist card once it renders.
const requestTwoStepPlan = async (
  page: Page,
  tokenA: string,
  tokenB: string
): Promise<Locator> => {
  await openAssistant(page);
  await askAssistant(
    page,
    `Run a two-step plan: add ${tokenA} and then add ${tokenB}`
  );
  const card = page.locator('section[aria-label="Confirm 2 changes"]');
  await expect(card).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(
    card.getByRole("heading", { name: "Review 2 proposed changes" })
  ).toBeVisible();
  // Both proposed writes are editable in the checklist, in proposal order.
  await expect(card.getByLabel("company name").nth(0)).toHaveValue(tokenA);
  await expect(card.getByLabel("company name").nth(1)).toHaveValue(tokenB);
  return card;
};

test("confirming a two-step plan executes both writes in order", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const tokenA = uniqueCompanyToken();
  const tokenB = uniqueCompanyToken();
  const card = await requestTwoStepPlan(page, tokenA, tokenB);

  // Both items are proposed and waiting; nothing has been written yet.
  await expect
    .poll(() => auditStatusForToken(tokenA), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("proposed");
  await expect
    .poll(() => auditStatusForToken(tokenB), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("proposed");

  await card.getByRole("button", { name: "Confirm 2" }).click();

  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(tokenA), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("executed");
  await expect
    .poll(() => auditStatusForToken(tokenB), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("executed");

  // Sequential execution in proposal order: the first item resolved no later
  // than the second.
  const rowA = await auditRowForToken(tokenA);
  const rowB = await auditRowForToken(tokenB);
  expect(rowA?.resolvedAt).toBeTruthy();
  expect(rowB?.resolvedAt).toBeTruthy();
  expect(new Date(rowA?.resolvedAt ?? 0).getTime()).toBeLessThanOrEqual(
    new Date(rowB?.resolvedAt ?? 0).getTime()
  );

  // Both leads are real: they land in the inbox (no owner was proposed).
  await page.goto("/inbox");
  await expect(page.getByText(tokenA).first()).toBeVisible();
  await expect(page.getByText(tokenB).first()).toBeVisible();
});

test("skipping one plan item applies the rest and denies the skipped one", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const tokenA = uniqueCompanyToken();
  const tokenB = uniqueCompanyToken();
  const card = await requestTwoStepPlan(page, tokenA, tokenB);

  // Uncheck the second item's Include toggle, then confirm the remainder.
  await card.getByRole("checkbox").nth(1).uncheck();
  await card.getByRole("button", { name: "Confirm 1" }).click();

  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(tokenA), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("executed");
  await expect
    .poll(() => auditStatusForToken(tokenB), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("denied");

  await page.goto("/inbox");
  await expect(page.getByText(tokenA).first()).toBeVisible();
  await expect(page.getByText(tokenB)).toHaveCount(0);
});

test("cancelling a two-step plan denies every item", async ({ page }) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const tokenA = uniqueCompanyToken();
  const tokenB = uniqueCompanyToken();
  const card = await requestTwoStepPlan(page, tokenA, tokenB);

  await card.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  await expect
    .poll(() => auditStatusForToken(tokenA), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("denied");
  await expect
    .poll(() => auditStatusForToken(tokenB), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("denied");

  await page.goto("/inbox");
  await expect(page.getByText(tokenA)).toHaveCount(0);
  await expect(page.getByText(tokenB)).toHaveCount(0);
});

test("a new message supersedes the plan and denies every item", async ({
  page,
}) => {
  await page.goto("/");
  await skipUnlessAssistantConfigured(page, test);

  const tokenA = uniqueCompanyToken();
  const tokenB = uniqueCompanyToken();
  await requestTwoStepPlan(page, tokenA, tokenB);

  // Moving on without deciding counts as a denial of the whole plan; nothing
  // is ever applied without an explicit confirm. The superseding message
  // rides in with the denied items' tool_results, so the mock answers it
  // with its closing text.
  await askAssistant(page, "Never mind, hello instead");
  await expect(page.getByText("Mock summary: all done here.")).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });

  await expect
    .poll(() => auditStatusForToken(tokenA), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("denied");
  await expect
    .poll(() => auditStatusForToken(tokenB), { timeout: RESPONSE_TIMEOUT_MS })
    .toBe("denied");

  await page.goto("/inbox");
  await expect(page.getByText(tokenA)).toHaveCount(0);
  await expect(page.getByText(tokenB)).toHaveCount(0);
});
