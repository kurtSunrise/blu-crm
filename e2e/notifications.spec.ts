import { expect, test } from "@playwright/test";
import { queryRows, readEnvValue } from "./test-db";

// The overhauled notification system (FR-11.1): per-user feed scoping, the
// unread bell badge, per-item read state, per-user preferences, admin
// handover routing, and the idempotent cron sweeps.
//
// Every stamped row is test-shaped (a 13-digit timestamp in the payload's
// dealTitle or action), so the shared-DB sweep in test-data-sweep.ts removes
// it. Cross-project safety: the phone/tablet/desktop projects run these tests
// CONCURRENTLY against the same seeded users, so anything touching a shared
// per-user switch (preference rows, mark-all-read) is either keyed per
// project below or written to converge under interleaving. Kurt's
// notification-generating preferences are never muted and Kurt is never
// removed from handover routing, because other specs assert his rows.

const UNREAD_BELL_PATTERN = /Notifications, \d+ unread/;

const KURT_EMAIL = "kurt@blu.builders";
const JESS_EMAIL = "jess@blu.builders";
const ANDY_EMAIL = "andy@blu.builders";

// Each project mutes a DIFFERENT (user, type) pair so parallel projects never
// fight over one preference row. Kurt is deliberately absent.
const MUTE_TARGET_BY_PROJECT: Record<
  string,
  { email: string; trigger: "cron" | "sweep"; type: string }
> = {
  phone: { email: JESS_EMAIL, type: "follow_up_overdue", trigger: "sweep" },
  tablet: { email: ANDY_EMAIL, type: "follow_up_overdue", trigger: "sweep" },
  desktop: { email: JESS_EMAIL, type: "follow_up_due", trigger: "cron" },
};

// Kurt's toggles the preferences-form test may flip per project: types no
// other spec asserts for Kurt. The wrapping label includes helper copy, so
// checkboxes match by label-prefix pattern.
const FORM_TOGGLE_BY_PROJECT: Record<
  string,
  { pattern: RegExp; type: string }
> = {
  phone: { pattern: /Follow-up due today/, type: "follow_up_due" },
  tablet: { pattern: /Quote viewed/, type: "quote_viewed" },
  desktop: { pattern: /Deal needs attention/, type: "stale_deal" },
};

const KURT_RECIPIENT_PATTERN = /Kurt Weiss/;
const JESS_RECIPIENT_PATTERN = /Jessica Rodin/;

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

const insertNotification = async (
  userId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<void> => {
  await queryRows(
    `insert into "notification" (id, user_id, type, payload)
     values (gen_random_uuid(), $1, $2, $3::jsonb)`,
    [userId, type, JSON.stringify(payload)]
  );
};

const quickAddDeal = async (
  page: import("@playwright/test").Page,
  companyName: string
) => {
  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 555 666");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");
};

const dealIdByTitle = async (companyName: string): Promise<string> => {
  const rows = await queryRows<{ id: string }>(
    'select id from "deal" where title like $1 order by created_at desc limit 1',
    [`%${companyName}%`]
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(`Deal for ${companyName} not found`);
  }
  return id;
};

const cronSecretOrThrow = (): string => {
  const secret = readEnvValue("CRON_SECRET");
  if (!secret) {
    throw new Error("CRON_SECRET not found in environment or .env.local");
  }
  return secret;
};

test("the feed is scoped per user and mark-all-read never touches teammates (FR-11.1)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const mine = `Mine Co ${stamp}`;
  const theirs = `Theirs Co ${stamp}`;
  const [kurtId, jessId] = await Promise.all([
    userIdByEmail(KURT_EMAIL),
    userIdByEmail(JESS_EMAIL),
  ]);

  await insertNotification(kurtId, "lead_assigned", { dealTitle: mine });
  await insertNotification(jessId, "lead_assigned", { dealTitle: theirs });

  // The suite session is Kurt: his row shows, Jess's never does.
  await page.goto("/notifications");
  await expect(
    page.locator("li").filter({ hasText: mine }).first()
  ).toBeVisible();
  await expect(page.locator("li").filter({ hasText: theirs })).toHaveCount(0);

  // The bell badge reflects Kurt's unread count. A parallel project's
  // mark-all-read can zero it at any moment, so each retry seeds a fresh
  // unread probe row before checking.
  await expect(async () => {
    await insertNotification(kurtId, "lead_assigned", {
      dealTitle: `Badge probe ${stamp}`,
    });
    await page.reload();
    await expect(
      page.getByRole("link", { name: UNREAD_BELL_PATTERN }).first()
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  // Mark all read. If a parallel project already cleared Kurt's unread, the
  // button is gone and the goal state is already reached.
  const markAll = page.getByRole("button", { name: "Mark all read" });
  if (await markAll.isVisible()) {
    await markAll.click();
  }

  // Kurt's stamped row flips read; Jess's stays unread (mark-all is scoped:
  // nothing in the suite ever reads her rows).
  await expect(async () => {
    const rows = await queryRows<{ read: boolean; title: string }>(
      `select payload->>'dealTitle' as title, read_at is not null as read
       from "notification" where payload->>'dealTitle' in ($1, $2)`,
      [mine, theirs]
    );
    expect(rows.find((row) => row.title === mine)?.read).toBe(true);
    expect(rows.find((row) => row.title === theirs)?.read).toBe(false);
  }).toPass({ timeout: 15_000 });
});

test("tapping a notification opens its deal and marks it read; the toggle flips it back", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `NotifNav Co ${stamp}`;
  const kurtId = await userIdByEmail(KURT_EMAIL);

  await quickAddDeal(page, companyName);
  const dealId = await dealIdByTitle(companyName);
  await insertNotification(kurtId, "lead_assigned", {
    dealId,
    dealTitle: companyName,
  });

  await page.goto("/notifications");
  const card = page.locator("li").filter({ hasText: companyName }).first();
  await card.getByRole("link").click();
  await page.waitForURL(`**/deals/${dealId}`);

  // Tap-through fires a fire-and-forget read receipt.
  await expect(async () => {
    const rows = await queryRows<{ read: boolean }>(
      `select read_at is not null as read from "notification"
       where payload->>'dealTitle' = $1`,
      [companyName]
    );
    expect(rows[0]?.read).toBe(true);
  }).toPass({ timeout: 15_000 });

  // The toggle flips it back to unread. A parallel project's mark-all-read
  // can re-read it mid-assertion, so each retry re-toggles when needed and
  // the loop converges on unread.
  await page.goto("/notifications");
  const readCard = page.locator("li").filter({ hasText: companyName }).first();
  await expect(async () => {
    const newBadge = readCard.getByText("New", { exact: true });
    if (!(await newBadge.isVisible())) {
      await readCard.getByRole("button", { name: "Mark as unread" }).click();
    }
    await expect(newBadge).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});

test("a muted preference suppresses new notifications for that user only, and unmuting resumes them", async ({
  page,
  request,
}, testInfo) => {
  const target = MUTE_TARGET_BY_PROJECT[testInfo.project.name];
  if (!target) {
    throw new Error(`No mute target mapped for ${testInfo.project.name}`);
  }
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `MutedSweep Co ${stamp}`;
  const action = `Chase ${stamp}`;
  const targetId = await userIdByEmail(target.email);

  // Trigger generation: the overdue sweep runs on the feed page load; the
  // due-today sweep only runs from the cron route.
  const generate = async () => {
    if (target.trigger === "cron") {
      const response = await request.post("/api/cron/notifications", {
        headers: { authorization: `Bearer ${cronSecretOrThrow()}` },
      });
      expect(response.ok()).toBe(true);
      return;
    }
    await page.goto("/notifications");
  };

  // Mute this project's (user, type) pair, then give that user a matching
  // follow-up on a fresh deal.
  await queryRows(
    `insert into "notification_preference" (user_id, type, enabled)
     values ($1, $2, false)
     on conflict (user_id, type) do update set enabled = false`,
    [targetId, target.type]
  );
  await quickAddDeal(page, companyName);
  const dealId = await dealIdByTitle(companyName);
  const dueDate =
    target.type === "follow_up_due" ? "now()" : "now() - interval '1 day'";
  await queryRows(
    `insert into "follow_up" (id, deal_id, action, owner_id, due_date)
     values (gen_random_uuid(), $1, $2, $3, ${dueDate})`,
    [dealId, action, targetId]
  );

  // The muted preference filters the recipient out at emit time. The type
  // filter matters: a due-today follow-up drifts into overdue moments later,
  // and that separate type must not pollute this count.
  await generate();
  const suppressed = await queryRows<{ id: string }>(
    `select id from "notification" where type = $1 and payload->>'action' = $2`,
    [target.type, action]
  );
  expect(suppressed).toHaveLength(0);

  // Unmute and generate again: the row lands now (the mute never burned the
  // dedupe key), exactly once.
  await queryRows(
    `update "notification_preference" set enabled = true
     where user_id = $1 and type = $2`,
    [targetId, target.type]
  );
  await expect(async () => {
    await generate();
    const rows = await queryRows<{ user_id: string }>(
      `select user_id from "notification"
       where type = $1 and payload->>'action' = $2`,
      [target.type, action]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(targetId);
  }).toPass({ timeout: 20_000 });
});

test("the preferences form saves and restores each toggle", async ({
  page,
}, testInfo) => {
  const formToggle = FORM_TOGGLE_BY_PROJECT[testInfo.project.name];
  if (!formToggle) {
    throw new Error(`No form toggle mapped for ${testInfo.project.name}`);
  }
  const togglePattern = formToggle.pattern;

  // A crashed earlier run can leave this pref muted; deleting the row
  // restores the enabled-by-default start state deterministically.
  const kurtId = await userIdByEmail(KURT_EMAIL);
  await queryRows(
    `delete from "notification_preference" where user_id = $1 and type = $2`,
    [kurtId, formToggle.type]
  );

  await page.goto("/settings/notifications");
  const toggle = page.getByRole("checkbox", { name: togglePattern });
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.").first()).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: togglePattern })
  ).not.toBeChecked();

  // Restore so repeated runs start from the enabled default.
  await page.getByRole("checkbox", { name: togglePattern }).check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.").first()).toBeVisible();
});

test("admins route handover notifications to the selected recipients (US-10)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Handover Co ${stamp}`;
  const jessId = await userIdByEmail(JESS_EMAIL);

  // Select Kurt AND Jess: keeping Kurt preserves the won-lost spec (which
  // asserts his handover row) when suites overlap on the shared DB, and every
  // parallel project saves the same recipient set.
  await page.goto("/settings/notifications");
  const routingForm = page
    .locator("section")
    .filter({ hasText: "Company event routing" });
  await routingForm
    .getByRole("checkbox", { name: KURT_RECIPIENT_PATTERN })
    .check();
  await routingForm
    .getByRole("checkbox", { name: JESS_RECIPIENT_PATTERN })
    .check();
  await routingForm.getByRole("button", { name: "Save recipients" }).click();
  await expect(routingForm.getByText("Recipients saved.")).toBeVisible();

  // Move a fresh deal to Won with the handover flag.
  await quickAddDeal(page, companyName);
  await page
    .getByRole("button", { name: `Move ${companyName} to another stage` })
    .click();
  await page.getByRole("menuitem", { name: "Won", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const moveCommitted = page.waitForResponse(
    (response) => response.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: "Mark as won" }).click();
  await moveCommitted;

  // Jess is a configured recipient, so the routed row lands for her.
  await expect(async () => {
    const rows = await queryRows<{ user_id: string }>(
      `select user_id from "notification"
       where type = 'handover_to_delivery' and payload->>'dealTitle' like $1`,
      [`%${companyName}%`]
    );
    expect(rows.map((row) => row.user_id)).toContain(jessId);
  }).toPass({ timeout: 15_000 });
});

test("the cron endpoint is token-guarded and its sweeps are idempotent", async ({
  page,
  request,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `CronSweep Co ${stamp}`;
  const action = `Cron chase ${stamp}`;
  // Andy's follow_up_due: no project mutes that pair (see the map above), so
  // a concurrently-running muted-preference test can never suppress this row.
  const andyId = await userIdByEmail(ANDY_EMAIL);
  const cronSecret = cronSecretOrThrow();

  const unauthorised = await request.post("/api/cron/notifications");
  expect(unauthorised.status()).toBe(401);

  await quickAddDeal(page, companyName);
  const dealId = await dealIdByTitle(companyName);
  await queryRows(
    `insert into "follow_up" (id, deal_id, action, owner_id, due_date)
     values (gen_random_uuid(), $1, $2, $3, now())`,
    [dealId, action, andyId]
  );

  // Two runs, one row: the dedupe key makes the second sweep a no-op.
  for (let run = 0; run < 2; run += 1) {
    const response = await request.post("/api/cron/notifications", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(response.ok()).toBe(true);
  }

  const rows = await queryRows<{ id: string }>(
    `select id from "notification"
     where type = 'follow_up_due' and payload->>'action' = $1`,
    [action]
  );
  expect(rows).toHaveLength(1);
});
