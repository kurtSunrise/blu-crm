import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Resets CRM data in the local test database so E2E runs stay deterministic
// and fast (alert lists would otherwise grow with every run). Pipeline
// stages and users are seeded data and are kept.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DATABASE_URL_LINE = /^DATABASE_URL="?([^"\n]+)"?$/m;

const readDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // Playwright runs this from the repo root, where .env.local lives.
  const envFile = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const match = envFile.match(DATABASE_URL_LINE);
  if (!match?.[1]) {
    throw new Error("DATABASE_URL not found in environment or .env.local");
  }
  return match[1];
};

// Children before parents; quote/attachment/follow_up/activity reference
// deal, deal references contact/company.
const TABLES_TO_CLEAR = [
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
