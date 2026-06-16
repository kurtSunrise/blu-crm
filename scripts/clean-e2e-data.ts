// On-demand removal of E2E-generated rows that have accumulated in the shared
// Neon DB next to real project data. Wraps the shared sweep (e2e/test-data-sweep)
// in a transaction. Set DRY_RUN=1 to roll back and only report what would go.
import pg from "pg";
import { sweepTestData } from "../e2e/test-data-sweep";
import { readDatabaseUrl } from "../e2e/test-db";

const DRY_RUN = process.env.DRY_RUN === "1";
const TS = "[0-9]{13}";

const run = async (): Promise<void> => {
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    const results = await sweepTestData(client);
    for (const { label, deleted } of results) {
      process.stdout.write(`${label}: deleted ${deleted}\n`);
    }
    // Confirm no test-named company slipped through (would mean a real record
    // still references it — worth a human look before committing).
    const left = await client.query<{ n: string }>(
      `select count(*)::int as n from "company" where name ~ '${TS}'`
    );
    process.stdout.write(
      `\ntest-named companies remaining: ${left.rows[0].n}\n`
    );

    if (DRY_RUN) {
      await client.query("rollback");
      process.stdout.write("DRY_RUN — rolled back, nothing committed.\n");
    } else {
      await client.query("commit");
      process.stdout.write("Committed.\n");
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`clean failed: ${String(error)}\n`);
  process.exit(1);
});
