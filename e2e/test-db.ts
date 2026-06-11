import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Shared DB access for E2E: global-setup wipes CRM data between runs, and
// specs assert server-side state (e.g. the ai_audit_log lifecycle) that has
// no UI surface yet.

const DATABASE_URL_LINE = /^DATABASE_URL="?([^"\n]+)"?$/m;

export const readDatabaseUrl = (): string => {
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

export const queryRows = async <T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> => {
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query<T>(sql, params);
    return result.rows;
  } finally {
    await client.end();
  }
};
