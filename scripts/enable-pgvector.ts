// Enables the pgvector extension for knowledge_chunk.embedding. drizzle-kit
// push cannot create extensions (its diff fails on the `vector` type when the
// extension is missing), so run this BEFORE `db:push` in every environment:
//   npm run db:pgvector        (dev / e2e staging branch, .env.local)
//   npm run db:pgvector:prod   (prod, .env.production)
// Idempotent. On Neon the extension is preinstalled and this just enables it;
// a plain localhost Postgres needs pgvector installed on the server first.
import pg from "pg";

const readDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (run via dotenv -e .env.local).");
  }
  return url;
};

const run = async (): Promise<void> => {
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query("create extension if not exists vector");
    const { rows } = await client.query<{ extversion: string }>(
      "select extversion from pg_extension where extname = 'vector'"
    );
    process.stdout.write(
      `pgvector enabled (version ${rows[0]?.extversion ?? "unknown"}).\n`
    );
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`enable-pgvector failed: ${String(error)}\n`);
  process.exit(1);
});
