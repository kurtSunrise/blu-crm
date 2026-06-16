// Read-only audit: find rows that look E2E-generated so we can review before
// deleting. Signature: a 13-digit Date.now() timestamp baked into a name/title,
// or an @example.com address. Real client data has neither.
import { queryRows } from "../e2e/test-db";

const TS = "[0-9]{13}"; // Date.now() in ms is 13 digits

interface Probe {
  sample: string;
  table: string;
  where: string;
}

const PROBES: Probe[] = [
  { table: "company", where: `name ~ '${TS}'`, sample: "name" },
  {
    table: "contact",
    where: `name ~ '${TS}' or email like '%@example.com' or email like '%.example.com'`,
    sample: "name",
  },
  { table: "deal", where: `title ~ '${TS}'`, sample: "title" },
  { table: "follow_up", where: `action ~ '${TS}'`, sample: "action" },
];

const run = async (): Promise<void> => {
  for (const probe of PROBES) {
    const countRows = await queryRows<{ n: string }>(
      `select count(*)::int as n from "${probe.table}" where ${probe.where}`
    );
    const total = await queryRows<{ n: string }>(
      `select count(*)::int as n from "${probe.table}"`
    );
    const samples = await queryRows<Record<string, string>>(
      `select ${probe.sample} from "${probe.table}" where ${probe.where} order by ${probe.sample} limit 8`
    );
    process.stdout.write(
      `\n${probe.table}: ${countRows[0].n} test-like / ${total[0].n} total\n`
    );
    for (const row of samples) {
      process.stdout.write(`   • ${row[probe.sample]}\n`);
    }
  }
  // Also show what real (non-test) companies/deals look like so we can sanity
  // check the filter isn't catching genuine projects.
  const realCompanies = await queryRows<{ name: string }>(
    `select name from "company" where name !~ '${TS}' order by name limit 20`
  );
  process.stdout.write("\nNon-test companies (kept):\n");
  for (const row of realCompanies) {
    process.stdout.write(`   • ${row.name}\n`);
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`audit failed: ${String(error)}\n`);
  process.exit(1);
});
