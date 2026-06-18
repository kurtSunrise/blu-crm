import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Shared DB access for E2E: global-setup wipes CRM data between runs, and
// specs assert server-side state (e.g. the ai_audit_log lifecycle) that has
// no UI surface yet.

// Playwright does not load .env.local, so config that seeds/targets the DB
// (DATABASE_URL, the seed password, the E2E_DB_HOST guard) is read here: real
// environment first, then the .env.local file Next dev uses.
export const readEnvValue = (key: string): string | undefined => {
  const fromEnv = process.env[key];
  if (fromEnv) {
    return fromEnv;
  }
  let envFile: string;
  try {
    envFile = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  // key is a fixed caller-supplied constant, so this literal-anchored match is
  // safe and built once per lookup (no loop).
  const match = envFile.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, "m"));
  return match?.[1];
};

export const readDatabaseUrl = (): string => {
  const url = readEnvValue("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL not found in environment or .env.local");
  }
  return url;
};

// Hard guard so E2E (which clears/sweeps data) can NEVER point at production.
// The suite refuses to run unless DATABASE_URL's host matches E2E_DB_HOST.
// Matching on the host — not a bare boolean — means a flag that leaks into
// another environment still cannot authorise prod: production runs on its own
// Neon endpoint, so its host will not match the configured test host.
export const assertTestDatabase = (url: string): void => {
  const host = new URL(url).hostname;
  const allowed = readEnvValue("E2E_DB_HOST")?.trim();
  if (!allowed) {
    throw new Error(
      "E2E_DB_HOST is not set. Point it at your disposable test DB host (the Neon staging branch) in .env.local. The E2E suite refuses to run until DATABASE_URL matches it, so production can never be used for tests."
    );
  }
  if (host !== allowed) {
    throw new Error(
      `Refusing to run E2E: DATABASE_URL host "${host}" does not match E2E_DB_HOST "${allowed}". Point DATABASE_URL at the test branch, or update E2E_DB_HOST.`
    );
  }
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
