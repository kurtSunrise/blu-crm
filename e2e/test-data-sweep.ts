import type pg from "pg";

// Scoped removal of E2E-generated rows. Safe to run against ANY database,
// including the shared remote Neon instance that also holds real projects:
// every predicate matches only test-shaped data — a 13-digit Date.now()
// timestamp baked into a name/title, an @example.com contact email, or a
// contact belonging to a timestamp-named company (some test contacts are named
// after a phone number). Real client data matches none of these.
//
// Children are deleted before parents, and each parent delete is guarded so a
// row still referenced by a surviving (real) record is kept rather than
// breaking a foreign key.

const TS = "[0-9]{13}";

const TEST_COMPANIES = `select id from "company" where name ~ '${TS}'`;
const TEST_DEALS = `select id from "deal" where title ~ '${TS}'`;
const TEST_CONTACTS = `select id from "contact" where name ~ '${TS}' or email like '%@example.com' or email like '%.example.com' or company_id in (${TEST_COMPANIES})`;
const TEST_THREADS = `select id from "chat_thread" where deal_id in (${TEST_DEALS}) or contact_id in (${TEST_CONTACTS})`;

export interface SweepStep {
  label: string;
  sql: string;
}

// Exported so callers can report per-table counts (the standalone script does).
export const SWEEP_STEPS: SweepStep[] = [
  {
    label: "chat_message",
    sql: `delete from "chat_message" where thread_id in (${TEST_THREADS})`,
  },
  {
    label: "ai_audit_log",
    sql: `delete from "ai_audit_log" where thread_id in (${TEST_THREADS})`,
  },
  {
    label: "chat_thread",
    sql: `delete from "chat_thread" where id in (${TEST_THREADS})`,
  },
  {
    label: "activity",
    sql: `delete from "activity" where deal_id in (${TEST_DEALS})`,
  },
  {
    label: "follow_up",
    sql: `delete from "follow_up" where deal_id in (${TEST_DEALS})`,
  },
  {
    label: "quote",
    sql: `delete from "quote" where deal_id in (${TEST_DEALS})`,
  },
  {
    label: "attachment",
    sql: `delete from "attachment" where deal_id in (${TEST_DEALS})`,
  },
  { label: "deal", sql: `delete from "deal" where title ~ '${TS}'` },
  {
    label: "contact",
    sql: `delete from "contact" c where c.id in (${TEST_CONTACTS})
      and not exists (select 1 from "deal" d where d.contact_id = c.id)
      and not exists (select 1 from "activity" a where a.contact_id = c.id)
      and not exists (select 1 from "chat_thread" t where t.contact_id = c.id)`,
  },
  {
    label: "company",
    sql: `delete from "company" co where co.name ~ '${TS}'
      and not exists (select 1 from "deal" d where d.company_id = co.id)
      and not exists (select 1 from "contact" c where c.company_id = co.id)`,
  },
];

// Runs every sweep step in order on the given connected client and returns the
// rows removed per table. The caller owns the transaction (or runs without one).
export const sweepTestData = async (
  client: pg.Client
): Promise<{ label: string; deleted: number }[]> => {
  const results: { label: string; deleted: number }[] = [];
  for (const step of SWEEP_STEPS) {
    const result = await client.query(step.sql);
    results.push({ label: step.label, deleted: result.rowCount ?? 0 });
  }
  return results;
};
