// One-off backfill: stamp dedupe keys onto follow_up_overdue notification
// rows that predate the dedupe_key column, so the cron sweep (which relies on
// the unique index for idempotency) can never re-notify history.
//
// Idempotent: only touches rows where dedupe_key is still null. Run AFTER
// `db:push` has added the column and BEFORE the cron-enabled code deploys:
//   npm run db:backfill-notification-dedupe        (dev, .env.local)
//   npm run db:backfill-notification-dedupe:prod   (prod, .env.production)
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
      `update "notification"
       set dedupe_key = 'follow_up_overdue:' || (payload->>'followUpId') || ':' || user_id
       where type = 'follow_up_overdue'
         and dedupe_key is null
         and payload->>'followUpId' is not null`
    );
    process.stdout.write(
      `backfill complete: ${result.rowCount ?? 0} follow_up_overdue row(s) stamped\n`
    );

    const { rows } = await client.query<{ remaining: string }>(
      `select count(*) as remaining from "notification"
       where type = 'follow_up_overdue' and dedupe_key is null`
    );
    process.stdout.write(
      `verification: ${rows[0]?.remaining ?? "?"} follow_up_overdue row(s) without a dedupe key remain (payload missing followUpId)\n`
    );
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(
    `notification dedupe backfill failed: ${String(error)}\n`
  );
  process.exit(1);
});
