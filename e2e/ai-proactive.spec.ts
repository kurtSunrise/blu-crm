import { expect, type Page, test } from "@playwright/test";
import { queryRows, readEnvValue } from "./test-db";

// Assistant v3 Phase 2: proactivity (PRD FR-8.2). The daily cron at
// /api/cron/assistant seeds ready-made assistant threads (Monday weekly
// report, Tue-Fri morning briefings, weekends nothing) and announces each via
// a notification carrying payload.threadId. Everything is deterministic
// (templated text, no model calls) and idempotent per AWST-dated dedupe key.
// The 503-when-CRON_SECRET-is-unset guard is not testable here because the
// e2e environment always sets the secret; the same guard pattern is covered
// for /api/cron/notifications by inspection of the shared route shape.
//
// The cron generates rows for EVERY active user with content to report, and
// its thread titles are not test-shaped (no 13-digit stamp), so the shared
// sweep in test-data-sweep.ts never removes them. The cron test therefore
// cleans up its own rows at the end by the dedupe keys it observed; a failed
// run leaves rows behind, but the next run converges on the same day's keys.

const RESPONSE_TIMEOUT_MS = 20_000;
const CRON_URL = "/api/cron/assistant";
const KURT_EMAIL = "kurt@blu.builders";
const ASSISTANT_PANEL = 'aside[aria-label="Blu assistant"]';
const WEEKLY_CARD_TITLE = "Your weekly pipeline report is ready";
const BRIEFING_CARD_TITLE = "Your morning briefing";
const WEEKLY_TEXT_PATTERN = /Here is your weekly pipeline report/;
const BRIEFING_TEXT_PATTERN = /Here is your briefing for/;
const NOTIFICATIONS_URL_PATTERN = /\/notifications$/;
const WEEKLY_TOGGLE_PATTERN = /Weekly pipeline report/;
const BRIEFING_TOGGLE_PATTERN = /Morning briefing/;

const MONDAY = 1;
const FRIDAY = 5;
const SUNDAY = 0;
const SATURDAY = 6;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;
// Perth is UTC+8 year-round (no DST); mirrors AWST_OFFSET_MS in src/lib/format.
const AWST_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_KEY_LENGTH = 10;

// The same weekday computation as the route: getUTCDay on the +8h-shifted
// instant (0 = Sunday).
const awstWeekday = (now: Date): number =>
  new Date(now.getTime() + AWST_OFFSET_MS).getUTCDay();

// "YYYY-MM-DD" of the current AWST day; the briefing's idempotency period.
const awstDateKey = (now: Date): string =>
  new Date(now.getTime() + AWST_OFFSET_MS)
    .toISOString()
    .slice(0, DATE_KEY_LENGTH);

// AWST Monday of the week containing `now`; the weekly report's period.
const awstWeekStartKey = (now: Date): string => {
  const shifted = new Date(now.getTime() + AWST_OFFSET_MS);
  const back = (shifted.getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return new Date(shifted.getTime() - back * MS_PER_DAY)
    .toISOString()
    .slice(0, DATE_KEY_LENGTH);
};

// "DD/MM" as formatDayMonthAwst renders it into the thread titles.
const AWST_DAY_MONTH = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Perth",
  day: "2-digit",
  month: "2-digit",
});

const cronSecretOrThrow = (): string => {
  const secret = readEnvValue("CRON_SECRET");
  if (!secret) {
    throw new Error("CRON_SECRET not found in environment or .env.local");
  }
  return secret;
};

const userIdByEmail = async (email: string): Promise<string> => {
  const rows = await queryRows<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(`Seeded user ${email} not found; run db:seed first.`);
  }
  return id;
};

interface CronResponse {
  created?: number;
  ran: string;
  skipped?: number;
}

const runAssistantCron = async (
  request: import("@playwright/test").APIRequestContext
): Promise<CronResponse> => {
  const response = await request.post(CRON_URL, {
    headers: { authorization: `Bearer ${cronSecretOrThrow()}` },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CronResponse;
};

// Removes every proactive row this run's cron calls minted for today's
// period (all recipients, not just Kurt): the notification rows under the
// dated dedupe-key prefix and the threads their payloads point at. Threads
// cascade their chat_message and chat_artifact children.
const cleanUpProactiveRows = async (dedupeKeyPrefix: string): Promise<void> => {
  const rows = await queryRows<{ id: string; thread_id: string | null }>(
    `select id, payload->>'threadId' as thread_id from "notification"
     where dedupe_key like $1`,
    [`${dedupeKeyPrefix}%`]
  );
  const threadIds = rows.flatMap((row) =>
    row.thread_id ? [row.thread_id] : []
  );
  await queryRows('delete from "notification" where dedupe_key like $1', [
    `${dedupeKeyPrefix}%`,
  ]);
  if (threadIds.length > 0) {
    await queryRows('delete from "chat_thread" where id = any($1)', [
      threadIds,
    ]);
  }
};

// Weekend fallback for the notification-click flow: seeds a weekly-report
// thread directly, copying the message content shape of seedProactiveThread
// in src/lib/ai/proactive.ts exactly (plain [{ text, type: "text" }] block
// arrays for both turns). The artifact card is skipped: its jsonb shape is a
// full weekly report and the click flow only needs the transcript.
const seedWeeklyReportThreadViaSql = async (
  kurtId: string,
  title: string
): Promise<{ notificationId: string; threadId: string }> => {
  const threads = await queryRows<{ id: string }>(
    `insert into "chat_thread" (user_id, title, origin_page, last_message_at)
     values ($1, $2, '/reports/weekly', now())
     returning id`,
    [kurtId, title]
  );
  const threadId = threads[0]?.id;
  if (!threadId) {
    throw new Error("Failed to seed the weekly report thread");
  }
  const assistantText =
    "Here is your weekly pipeline report for the week starting 06/07/2026. The open pipeline holds 3 deals worth $10,000 ($5,000 weighted). This week: 1 new, 0 won, 0 lost, with 1 deal closing within 14 days and 1 deal needing attention.";
  await queryRows(
    `insert into "chat_message" (thread_id, role, content, created_at)
     values
       ($1, 'user', $2::jsonb, now() - interval '2 seconds'),
       ($1, 'assistant', $3::jsonb, now() - interval '1 second')`,
    [
      threadId,
      JSON.stringify([
        { text: "Generate this week's pipeline report", type: "text" },
      ]),
      JSON.stringify([{ text: assistantText, type: "text" }]),
    ]
  );
  const notifications = await queryRows<{ id: string }>(
    `insert into "notification" (id, user_id, type, payload)
     values (gen_random_uuid(), $1, 'weekly_report', $2::jsonb)
     returning id`,
    [kurtId, JSON.stringify({ threadId })]
  );
  const notificationId = notifications[0]?.id;
  if (!notificationId) {
    throw new Error("Failed to seed the weekly report notification");
  }
  return { notificationId, threadId };
};

const expectNotificationRead = async (notificationId: string): Promise<void> =>
  await expect
    .poll(
      async () => {
        const rows = await queryRows<{ read: boolean }>(
          'select read_at is not null as read from "notification" where id = $1',
          [notificationId]
        );
        return rows[0]?.read ?? "missing";
      },
      { timeout: RESPONSE_TIMEOUT_MS }
    )
    .toBe(true);

// Clicks the whole-card button of the proactive notification and asserts the
// assistant dock opens on its thread (transcript visible, no navigation).
const openProactiveCard = async (
  page: Page,
  cardTitle: string,
  transcriptPattern: RegExp
): Promise<void> => {
  await page.goto("/notifications");
  const card = page
    .locator("li")
    .filter({ hasText: cardTitle })
    .first()
    .getByRole("button", { name: new RegExp(cardTitle) });
  await expect(card).toBeVisible();
  await card.click();

  const panel = page.locator(ASSISTANT_PANEL);
  await expect(
    panel.getByRole("textbox", { name: "Message the assistant" })
  ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(panel.getByText(transcriptPattern).first()).toBeVisible({
    timeout: RESPONSE_TIMEOUT_MS,
  });
  // The card opens the dock in place; it never routes anywhere.
  await expect(page).toHaveURL(NOTIFICATIONS_URL_PATTERN);
};

test("the assistant cron rejects requests without a valid bearer token", async ({
  request,
}) => {
  const missing = await request.post(CRON_URL);
  expect(missing.status()).toBe(401);

  const wrong = await request.post(CRON_URL, {
    headers: { authorization: "Bearer not-the-cron-secret" },
  });
  expect(wrong.status()).toBe(401);
});

test("the assistant cron runs today's AWST branch idempotently and its notification opens the dock on the thread", async ({
  page,
  request,
}, testInfo) => {
  const now = new Date();
  const weekday = awstWeekday(now);
  const dayMonth = AWST_DAY_MONTH.format(now);
  const kurtId = await userIdByEmail(KURT_EMAIL);

  if (weekday === SUNDAY || weekday === SATURDAY) {
    // Weekend: the cron declares a no-op both times and creates nothing.
    const before = await queryRows<{ count: string }>(
      'select count(*) as count from "notification" where type in ($1, $2)',
      ["weekly_report", "daily_briefing"]
    );
    for (let run = 0; run < 2; run += 1) {
      const body = await runAssistantCron(request);
      expect(body.ran).toBe("none");
      expect(body.created).toBeUndefined();
    }
    const after = await queryRows<{ count: string }>(
      'select count(*) as count from "notification" where type in ($1, $2)',
      ["weekly_report", "daily_briefing"]
    );
    expect(after[0]?.count).toBe(before[0]?.count);

    // The click flow still gets covered: seed a weekly-report thread and
    // notification directly, following the generator's content shape.
    const seeded = await seedWeeklyReportThreadViaSql(
      kurtId,
      `Weekly pipeline report - ${dayMonth}`
    );
    await openProactiveCard(page, WEEKLY_CARD_TITLE, WEEKLY_TEXT_PATTERN);
    await expect(
      page
        .locator(ASSISTANT_PANEL)
        .getByText("Generate this week's pipeline report")
        .first()
    ).toBeVisible();
    await expectNotificationRead(seeded.notificationId);

    await queryRows('delete from "notification" where id = $1', [
      seeded.notificationId,
    ]);
    await queryRows('delete from "chat_thread" where id = $1', [
      seeded.threadId,
    ]);
    return;
  }

  const isMonday = weekday === MONDAY;
  expect(weekday).toBeLessThanOrEqual(FRIDAY);
  const periodKey = isMonday ? awstWeekStartKey(now) : awstDateKey(now);
  const dedupeKeyPrefix = isMonday
    ? `weekly_report:${periodKey}:`
    : `daily_briefing:${periodKey}:`;
  const expectedRan = isMonday ? "weekly_report" : "daily_briefing";
  const expectedTitle = isMonday
    ? `Weekly pipeline report - ${dayMonth}`
    : `Morning briefing - ${dayMonth}`;

  // Briefings skip users with nothing to report, so guarantee Kurt is
  // eligible before the first run: a follow-up due today on a stamped
  // fixture deal (the stamp keeps deal and follow-up sweepable).
  if (!isMonday) {
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const enquiry = await request.post("/api/enquiries", {
      data: {
        company: `Briefing Fixture Co ${stamp}`,
        email: "proactive-e2e@example.com",
        message: "Morning briefing fixture lead",
        name: `Briefing Fixture ${stamp}`,
      },
    });
    expect(enquiry.ok()).toBe(true);
    const deals = await queryRows<{ id: string }>(
      'select id from "deal" where title like $1 order by created_at desc limit 1',
      [`%${stamp}%`]
    );
    const dealId = deals[0]?.id;
    expect(dealId).toBeTruthy();
    await queryRows(
      `insert into "follow_up" (id, deal_id, action, owner_id, due_date)
       values (gen_random_uuid(), $1, $2, $3, now())`,
      [dealId, `Briefing chase ${stamp}`, kurtId]
    );
  }

  const first = await runAssistantCron(request);
  expect(first.ran).toBe(expectedRan);

  // Idempotency: re-runs converge to creating nothing. The poll (rather than
  // a single strict second run) tolerates a parallel spec making another
  // user newly eligible between calls; the per-user uniqueness assertion
  // below is the hard duplicate check.
  await expect
    .poll(async () => (await runAssistantCron(request)).created, {
      timeout: RESPONSE_TIMEOUT_MS,
    })
    .toBe(0);

  // Exactly one dedupe-keyed notification for Kurt, carrying the thread id.
  const kurtRows = await queryRows<{ id: string; thread_id: string | null }>(
    `select id, payload->>'threadId' as thread_id from "notification"
     where dedupe_key = $1`,
    [`${dedupeKeyPrefix}${kurtId}`]
  );
  expect(kurtRows).toHaveLength(1);
  const notificationId = kurtRows[0]?.id as string;
  const threadId = kurtRows[0]?.thread_id;
  expect(threadId).toBeTruthy();

  // The thread is Kurt's, titled for today, and stayed singular across runs.
  const threads = await queryRows<{ title: string; user_id: string }>(
    'select title, user_id from "chat_thread" where id = $1',
    [threadId]
  );
  expect(threads[0]?.user_id).toBe(kurtId);
  expect(threads[0]?.title).toBe(expectedTitle);
  const titled = await queryRows<{ count: string }>(
    `select count(*) as count from "chat_thread"
     where user_id = $1 and title = $2 and archived_at is null`,
    [kurtId, expectedTitle]
  );
  expect(titled[0]?.count).toBe("1");

  // Tapping the card opens the assistant dock on that thread, marks the
  // notification read, and navigates nowhere.
  await openProactiveCard(
    page,
    isMonday ? WEEKLY_CARD_TITLE : BRIEFING_CARD_TITLE,
    isMonday ? WEEKLY_TEXT_PATTERN : BRIEFING_TEXT_PATTERN
  );
  const panel = page.locator(ASSISTANT_PANEL);
  await expect(
    panel
      .getByText(
        isMonday
          ? "Generate this week's pipeline report"
          : "Give me my morning briefing"
      )
      .first()
  ).toBeVisible();
  if (isMonday) {
    // Monday's thread persists the weekly_report artifact; resume re-renders
    // the card, not just the text.
    await expect(
      panel.locator('section[aria-label="Weekly pipeline report"]')
    ).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  }
  await expectNotificationRead(notificationId);

  await cleanUpProactiveRows(dedupeKeyPrefix);
});

test("a stale deal notification's Ask assistant button prefills the composer without navigating", async ({
  page,
  request,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const kurtId = await userIdByEmail(KURT_EMAIL);

  // A stamped fixture deal (sweepable) to hang the stale notification on.
  const enquiry = await request.post("/api/enquiries", {
    data: {
      company: `Stale Fixture Co ${stamp}`,
      email: "stale-ask-e2e@example.com",
      message: "Stale deal ask-assistant fixture lead",
      name: `Stale Fixture ${stamp}`,
    },
  });
  expect(enquiry.ok()).toBe(true);
  const deals = await queryRows<{ id: string; title: string }>(
    'select id, title from "deal" where title like $1 order by created_at desc limit 1',
    [`%${stamp}%`]
  );
  const deal = deals[0];
  expect(deal).toBeTruthy();
  if (!deal) {
    return;
  }

  await queryRows(
    `insert into "notification" (id, user_id, type, payload)
     values (gen_random_uuid(), $1, 'stale_deal', $2::jsonb)`,
    [kurtId, JSON.stringify({ dealId: deal.id, dealTitle: deal.title })]
  );

  await page.goto("/notifications");
  const card = page.locator("li").filter({ hasText: deal.title }).first();
  await card
    .getByRole("button", { name: "Ask the assistant about this deal" })
    .click();

  // The dock opens with the deal question staged (never auto-sent), and the
  // page has not navigated away from the feed.
  const composer = page
    .locator(ASSISTANT_PANEL)
    .getByRole("textbox", { name: "Message the assistant" });
  await expect(composer).toBeVisible({ timeout: RESPONSE_TIMEOUT_MS });
  await expect(composer).toHaveValue(
    `What is the situation with ${deal.title} and what should I do next?`
  );
  await expect(page).toHaveURL(NOTIFICATIONS_URL_PATTERN);
});

test("the notification preferences page lists toggles for the proactive assistant types", async ({
  page,
}) => {
  await page.goto("/settings/notifications");
  await expect(
    page.getByRole("checkbox", { name: WEEKLY_TOGGLE_PATTERN })
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: BRIEFING_TOGGLE_PATTERN })
  ).toBeVisible();
});
