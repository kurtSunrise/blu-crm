// One-off data migration: move deal sub-statuses from the hardcoded
// `deal_sub_status` pgEnum to the admin-configurable `deal_sub_status` table.
//
// `db:push` only does DDL (it cannot backfill), and it would drop the old
// `deal.sub_status` enum column (losing data) before anything could copy it.
// The new table also collides with the old enum's name, so this script renames
// the enum out of the way, creates + seeds the table, backfills the new FK
// column from the old enum values, then drops the old column and legacy type.
//
// Idempotent and transactional. Run BEFORE `db:push`:
//   dotenv -e .env.local      -- tsx scripts/migrate-sub-status.ts   (dev)
//   dotenv -e .env.production -- tsx scripts/migrate-sub-status.ts   (prod)
// After it runs, `db:push` reconciles the remaining detail (the FK constraint).
import pg from "pg";

// Seed the four original statuses with ids equal to the old enum values so the
// backfill is a straight `sub_status::text` copy. Colours are palette keys
// resolved in src/lib/labels.ts (red = blocked/at-risk, amber = waiting).
const SEED = [
  {
    id: "on_hold_third_party",
    label: "On Hold – Awaiting Third Party",
    color: "amber",
    position: 0,
  },
  {
    id: "blocked_external",
    label: "Blocked – External Dependency",
    color: "red",
    position: 1,
  },
  {
    id: "on_hold_client",
    label: "On Hold – Awaiting Client",
    color: "teal",
    position: 2,
  },
  {
    id: "on_hold_internal",
    label: "On Hold – Internal Review",
    color: "violet",
    position: 3,
  },
] as const;

const readDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (run via dotenv -e .env.local).");
  }
  return url;
};

const columnExists = async (
  client: pg.Client,
  table: string,
  column: string
): Promise<boolean> => {
  const { rows } = await client.query<{ exists: boolean }>(
    `select exists (
       select 1 from information_schema.columns
       where table_name = $1 and column_name = $2
     ) as exists`,
    [table, column]
  );
  return rows[0]?.exists ?? false;
};

const tableExists = async (
  client: pg.Client,
  table: string
): Promise<boolean> => {
  const { rows } = await client.query<{ exists: boolean }>(
    `select exists (
       select 1 from information_schema.tables
       where table_name = $1
     ) as exists`,
    [table]
  );
  return rows[0]?.exists ?? false;
};

const enumTypeExists = async (
  client: pg.Client,
  typeName: string
): Promise<boolean> => {
  const { rows } = await client.query<{ exists: boolean }>(
    "select exists (select 1 from pg_type where typname = $1) as exists",
    [typeName]
  );
  return rows[0]?.exists ?? false;
};

const run = async (): Promise<void> => {
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query("begin");

    // 1. Free the `deal_sub_status` name if the enum still owns it and the
    //    table doesn't exist yet. (enum→text casts work after the rename.)
    const hasTable = await tableExists(client, "deal_sub_status");
    const hasEnum = await enumTypeExists(client, "deal_sub_status");
    if (hasEnum && !hasTable) {
      await client.query(
        "alter type deal_sub_status rename to deal_sub_status_legacy"
      );
      process.stdout.write("renamed enum deal_sub_status -> _legacy\n");
    }

    // 2. Create the table (shape matches src/db/schema.ts).
    await client.query(`
      create table if not exists deal_sub_status (
        id text primary key,
        label text not null,
        color text not null,
        position integer not null,
        archived_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    // 3. Seed the four original statuses (no-op if already present).
    for (const s of SEED) {
      await client.query(
        `insert into deal_sub_status (id, label, color, position)
         values ($1, $2, $3, $4)
         on conflict (id) do nothing`,
        [s.id, s.label, s.color, s.position]
      );
    }

    // 4. Add the FK column (the FK constraint itself is added by db:push).
    await client.query(
      "alter table deal add column if not exists sub_status_id text"
    );

    // 5. Backfill from the old enum column, then drop it and the legacy type.
    if (await columnExists(client, "deal", "sub_status")) {
      const { rowCount } = await client.query(
        `update deal set sub_status_id = sub_status::text
         where sub_status is not null and sub_status_id is null`
      );
      process.stdout.write(`backfilled ${rowCount ?? 0} deal(s)\n`);
      await client.query("alter table deal drop column sub_status");
      process.stdout.write("dropped deal.sub_status\n");
    }
    await client.query("drop type if exists deal_sub_status_legacy");

    await client.query("commit");
    process.stdout.write("sub-status migration committed.\n");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`sub-status migration failed: ${String(error)}\n`);
  process.exit(1);
});
