// One-off backfill: reconstruct deal_stage_event history from the free-text
// `stage_change` activity rows ("Moved to {stage}…") that predate the
// structured event table, plus a synthetic "entered the pipeline" event per
// deal at its createdAt.
//
// Best-effort by design: stage names are resolved against the CURRENT
// pipeline_stage table, so stages renamed or deleted since the activity was
// written keep their name snapshot but get a null stage id. Every row this
// script writes is tagged source='backfill' so analytics can exclude it.
//
// Idempotent: stage-change rows key on the unique activity_id
// (ON CONFLICT DO NOTHING); synthetic create events are guarded by a
// NOT EXISTS on any earlier from-null event for the deal. Safe to run while
// the live write hooks are already deployed — the same keys make live writes
// and backfill mutually exclusive.
//
// Run AFTER `db:push` has created the table and AFTER the hooks are deployed:
//   npm run db:backfill-stage-events        (dev, .env.local)
//   npm run db:backfill-stage-events:prod   (prod, .env.production)
import pg from "pg";

// "Moved to Quote Sent", "Moved to Lost / Dormant (reason: Price)",
// "Moved to Won (handover to delivery flagged)" — capture the stage name,
// drop the parenthetical.
const MOVED_TO_PATTERN = /^Moved to (.+?)(?: \((?:reason|handover).*\))?$/;

const readDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (run via dotenv -e .env.local).");
  }
  return url;
};

interface StageChangeActivity {
  content: string | null;
  created_at: Date;
  created_by: string | null;
  deal_id: string;
  id: string;
}

interface DealRow {
  created_at: Date;
  created_by: string | null;
  id: string;
  stage_id: string;
}

interface EventInsert {
  activityId: string | null;
  changedAt: Date;
  changedBy: string | null;
  dealId: string;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string | null;
  toStageName: string;
}

interface StageRow {
  id: string;
  name: string;
  position: number;
}

interface BackfillContext {
  deals: DealRow[];
  firstStage: StageRow;
  movesByDeal: Map<string, StageChangeActivity[]>;
  stageIdByName: Map<string, string>;
  stageNameById: Map<string, string>;
}

const loadContext = async (client: pg.Client): Promise<BackfillContext> => {
  const { rows: stages } = await client.query<StageRow>(
    "select id, name, position from pipeline_stage order by position"
  );
  if (stages.length === 0) {
    throw new Error("No pipeline stages found; nothing to backfill against.");
  }

  const { rows: deals } = await client.query<DealRow>(
    "select id, created_at, created_by, stage_id from deal"
  );
  const { rows: moves } = await client.query<StageChangeActivity>(
    `select id, deal_id, content, created_by, created_at
     from activity where type = 'stage_change'
     order by deal_id, created_at, id`
  );
  const movesByDeal = new Map<string, StageChangeActivity[]>();
  for (const move of moves) {
    const list = movesByDeal.get(move.deal_id);
    if (list) {
      list.push(move);
    } else {
      movesByDeal.set(move.deal_id, [move]);
    }
  }

  return {
    deals,
    firstStage: stages[0],
    movesByDeal,
    stageIdByName: new Map(stages.map((s) => [s.name.toLowerCase(), s.id])),
    stageNameById: new Map(stages.map((s) => [s.id, s.name])),
  };
};

const buildDealEvents = (
  dealRow: DealRow,
  context: BackfillContext,
  unresolvedNames: Map<string, number>
): EventInsert[] => {
  const { firstStage } = context;
  // Synthetic entry into the pipeline. Assumes the first stage; deals
  // imported mid-pipeline get a wrong first hop, accepted and flagged by
  // the backfill source tag.
  const events: EventInsert[] = [
    {
      activityId: null,
      changedAt: dealRow.created_at,
      changedBy: dealRow.created_by,
      dealId: dealRow.id,
      fromStageId: null,
      fromStageName: null,
      toStageId: firstStage.id,
      toStageName: firstStage.name,
    },
  ];

  let previousId: string | null = firstStage.id;
  let previousName: string | null = firstStage.name;
  for (const move of context.movesByDeal.get(dealRow.id) ?? []) {
    const match = move.content?.match(MOVED_TO_PATTERN);
    if (!match) {
      continue;
    }
    const stageName = match[1];
    const stageId = context.stageIdByName.get(stageName.toLowerCase()) ?? null;
    if (!stageId) {
      unresolvedNames.set(stageName, (unresolvedNames.get(stageName) ?? 0) + 1);
    }
    events.push({
      activityId: move.id,
      changedAt: move.created_at,
      changedBy: move.created_by,
      dealId: dealRow.id,
      fromStageId: previousId,
      fromStageName: previousName,
      toStageId: stageId,
      toStageName: stageName,
    });
    previousId = stageId;
    previousName = stageName;
  }
  return events;
};

const insertEvent = async (
  client: pg.Client,
  event: EventInsert
): Promise<number> => {
  const result = event.activityId
    ? await client.query(
        `insert into deal_stage_event
           (id, deal_id, from_stage_id, from_stage_name, to_stage_id,
            to_stage_name, activity_id, source, changed_by, changed_at)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'backfill', $7, $8)
         on conflict (activity_id) do nothing`,
        [
          event.dealId,
          event.fromStageId,
          event.fromStageName,
          event.toStageId,
          event.toStageName,
          event.activityId,
          event.changedBy,
          event.changedAt,
        ]
      )
    : await client.query(
        `insert into deal_stage_event
           (id, deal_id, from_stage_id, from_stage_name, to_stage_id,
            to_stage_name, source, changed_by, changed_at)
         select gen_random_uuid(), $1, null, null, $2, $3, 'backfill', $4, $5
         where not exists (
           select 1 from deal_stage_event
           where deal_id = $1 and from_stage_id is null
         )`,
        [
          event.dealId,
          event.toStageId,
          event.toStageName,
          event.changedBy,
          event.changedAt,
        ]
      );
  return result.rowCount ?? 0;
};

// Verification pass (after commit, read-only): the last event per deal should
// land on the deal's current stage. Mismatches almost always mean a stage was
// renamed or deleted since the activity text was written.
const verifyChains = async (
  client: pg.Client,
  stageNameById: Map<string, string>
): Promise<void> => {
  const { rows: mismatches } = await client.query<{
    deal_id: string;
    last_to_stage_id: string | null;
    stage_id: string;
  }>(`
    select d.id as deal_id, d.stage_id, last_event.to_stage_id as last_to_stage_id
    from deal d
    join lateral (
      select to_stage_id from deal_stage_event e
      where e.deal_id = d.id
      order by e.changed_at desc, e.id desc
      limit 1
    ) last_event on true
    where last_event.to_stage_id is distinct from d.stage_id
  `);
  if (mismatches.length === 0) {
    process.stdout.write(
      "verification: every deal's history ends at its current stage.\n"
    );
    return;
  }
  process.stdout.write(
    `verification: ${mismatches.length} deal(s) whose last event does not match ` +
      "their current stage (renamed/deleted stages are the usual cause):\n"
  );
  const MISMATCH_PRINT_LIMIT = 20;
  for (const row of mismatches.slice(0, MISMATCH_PRINT_LIMIT)) {
    const eventStage = row.last_to_stage_id
      ? (stageNameById.get(row.last_to_stage_id) ?? row.last_to_stage_id)
      : "unresolved";
    const currentStage = stageNameById.get(row.stage_id) ?? row.stage_id;
    process.stdout.write(
      `  deal ${row.deal_id}: history ends at "${eventStage}", currently "${currentStage}"\n`
    );
  }
};

const reportUnresolved = (unresolvedNames: Map<string, number>): void => {
  if (unresolvedNames.size === 0) {
    return;
  }
  process.stdout.write("unresolved stage names (kept as snapshots):\n");
  for (const [name, occurrences] of unresolvedNames) {
    process.stdout.write(`  "${name}" x${occurrences}\n`);
  }
};

const run = async (): Promise<void> => {
  const client = new pg.Client({ connectionString: readDatabaseUrl() });
  await client.connect();
  try {
    await client.query("begin");

    const context = await loadContext(client);
    const unresolvedNames = new Map<string, number>();
    const events = context.deals.flatMap((dealRow) =>
      buildDealEvents(dealRow, context, unresolvedNames)
    );

    let inserted = 0;
    for (const event of events) {
      inserted += await insertEvent(client, event);
    }

    await client.query("commit");
    process.stdout.write(
      `backfill committed: ${inserted} of ${events.length} candidate events inserted ` +
        `(${events.length - inserted} already present)\n`
    );

    await verifyChains(client, context.stageNameById);
    reportUnresolved(unresolvedNames);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  process.stderr.write(`stage-event backfill failed: ${String(error)}\n`);
  process.exit(1);
});
