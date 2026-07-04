import pg from "pg";
import { readDatabaseUrl } from "../e2e/test-db";

const TS = "[0-9]{13}";
const run = async () => {
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    // Mirror the cleanup up to (but not including) the company delete.
    await client.query(
      `delete from "chat_message" where thread_id in (select id from "chat_thread" where deal_id in (select id from "deal" where title ~ '${TS}'))`
    );
    await client.query(
      `delete from "ai_audit_log" where thread_id in (select id from "chat_thread" where deal_id in (select id from "deal" where title ~ '${TS}'))`
    );
    await client.query(
      `delete from "chat_thread" where deal_id in (select id from "deal" where title ~ '${TS}')`
    );
    // deal_stage_event before activity: it FKs the activity rows it mirrors.
    for (const t of [
      "deal_stage_event",
      "activity",
      "follow_up",
      "quote",
      "attachment",
    ]) {
      await client.query(
        `delete from "${t}" where deal_id in (select id from "deal" where title ~ '${TS}')`
      );
    }
    await client.query(`delete from "deal" where title ~ '${TS}'`);
    await client.query(
      `delete from "contact" where (name ~ '${TS}' or email like '%@example.com' or email like '%.example.com') and id not in (select contact_id from "deal" where contact_id is not null)`
    );
    // Now: which flagged companies survive, and who references them?
    const lingering = await client.query<{ id: string; name: string }>(
      `select id, name from "company" where name ~ '${TS}' and (id in (select company_id from "deal" where company_id is not null) or id in (select company_id from "contact" where company_id is not null))`
    );
    process.stdout.write(`lingering companies: ${lingering.rowCount}\n`);
    for (const r of lingering.rows) {
      const d = await client.query<{ title: string }>(
        `select title from "deal" where company_id = $1`,
        [r.id]
      );
      const c = await client.query<{ name: string; email: string | null }>(
        `select name, email from "contact" where company_id = $1`,
        [r.id]
      );
      process.stdout.write(
        `\n[${r.name}]\n  deals: ${d.rows.map((x) => x.title).join(" | ") || "(none)"}\n  contacts: ${c.rows.map((x) => `${x.name}<${x.email}>`).join(" | ") || "(none)"}\n`
      );
    }
  } finally {
    await client.query("rollback");
    await client.end();
  }
};
run().catch((e: unknown) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
