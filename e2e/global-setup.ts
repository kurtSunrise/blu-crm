import pg from "pg";
import { readDatabaseUrl } from "./test-db";

// Resets CRM data in the local test database so E2E runs stay deterministic
// and fast (alert lists would otherwise grow with every run). Pipeline
// stages and users are seeded data and are kept.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Children before parents; quote/attachment/follow_up/activity reference
// deal, deal references contact/company, and the chat tables reference
// deal/contact too (chat_thread must go before deal or its FK blocks the
// delete).
const TABLES_TO_CLEAR = [
  "ai_audit_log",
  "chat_message",
  "chat_thread",
  "notification",
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
  const databaseUrl = readDatabaseUrl();
  const host = new URL(databaseUrl).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    // Never wipe a shared database; remote runs keep their data.
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
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
