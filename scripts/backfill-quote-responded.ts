// One-off backfill: stamp responded_at on quotes that were already accepted
// or declined before the column existed, using updated_at as the best
// available approximation of the decision moment. Idempotent (only touches
// null responded_at rows). Run AFTER `db:push` has added the column:
//   npm run db:backfill-quote-responded        (dev, .env.local)
//   npm run db:backfill-quote-responded:prod   (prod, .env.production)
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
    const result = await client.query(
      `update quote set responded_at = updated_at
       where status in ('accepted', 'declined') and responded_at is null`
    );
    process.stdout.write(
      `quote responded_at backfill: ${result.rowCount ?? 0} row(s) stamped\n`
    );
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`quote backfill failed: ${String(error)}\n`);
  process.exit(1);
});
