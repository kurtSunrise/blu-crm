import { mkdirSync } from "node:fs";
import path from "node:path";
import { request as playwrightRequest } from "@playwright/test";
import pg from "pg";
import { sweepTestData } from "./test-data-sweep";
import { assertTestDatabase, readDatabaseUrl, readEnvValue } from "./test-db";

// Keeps E2E runs deterministic by clearing prior test data before each run.
// A true localhost dev DB is fully reset (no real data lives there). The
// shared remote Neon DB also holds real projects, so there we sweep only this
// suite's test-shaped rows (see test-data-sweep) — never real records. Pipeline
// stages and users are seeded data and are kept. Then signs in once as a seeded
// team member and saves the storage state every project reuses (the (app)
// shell requires a session since M0 auth shipped).

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export const STORAGE_STATE_PATH = "output/playwright/.auth/team.json";

// The suite runs as Kurt; credentials come from db:seed (SEED_USER_PASSWORD,
// local default blu-crm-dev).
const E2E_EMAIL = "kurt@blu.builders";

const signInForSuite = async (): Promise<void> => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const context = await playwrightRequest.newContext({ baseURL });
  const response = await context.post("/api/auth/sign-in/email", {
    data: {
      email: E2E_EMAIL,
      password: readEnvValue("SEED_USER_PASSWORD") ?? "blu-crm-dev",
    },
  });
  if (!response.ok()) {
    await context.dispose();
    throw new Error(
      `E2E sign-in as ${E2E_EMAIL} failed (HTTP ${response.status()}). Run "npm run db:seed" against this database first.`
    );
  }
  mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await context.storageState({ path: STORAGE_STATE_PATH });
  await context.dispose();
};

// Children before parents; quote/attachment/follow_up/activity reference
// deal, deal references contact/company, and the chat tables reference
// deal/contact too (chat_thread must go before deal or its FK blocks the
// delete).
const TABLES_TO_CLEAR = [
  "ai_audit_log",
  "assistant_memory",
  "chat_message",
  "chat_thread",
  "notification",
  "notification_preference",
  "activity",
  "follow_up",
  "quote",
  "attachment",
  "deal",
  "contact",
  "company",
  "app_setting",
];

const globalSetup = async (): Promise<void> => {
  // Refuse to run against anything but the configured test DB before we sign in
  // or touch a single row — production must never be a test target.
  const databaseUrl = readDatabaseUrl();
  assertTestDatabase(databaseUrl);

  // The web servers are already up (Playwright starts webServer entries
  // before global setup), so the suite session can be created here.
  await signInForSuite();

  const host = new URL(databaseUrl).hostname;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (!LOCAL_HOSTS.has(host)) {
      // Shared DB: remove only this suite's test-shaped rows so prior runs
      // don't accumulate next to real projects. Real data is never matched.
      await sweepTestData(client);
      return;
    }

    for (const table of TABLES_TO_CLEAR) {
      await client.query(`delete from "${table}"`);
    }
    // Stage-management tests add temporary stages; a failed run can leave
    // them behind, so drop everything beyond the seeded eight (deals were
    // cleared above, so no rows still reference them).
    await client.query(
      `delete from "pipeline_stage" where name not in (
        'Lead Captured', 'Qualified', 'Brief / Site Visit',
        'Concept / Quote Issued', 'Proposal Review', 'Negotiation',
        'Won', 'Lost / Dormant'
      )`
    );
  } finally {
    await client.end();
  }
};

export default globalSetup;
