import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import type { TimelineEntry } from "@/components/deal-timeline-style";
import { db } from "@/db";
import {
  activity,
  company,
  deal,
  dealStageEvent,
  dealSubStatus,
  followUp,
  leadSource,
  pipelineStage,
  quote,
  user,
} from "@/db/schema";
import {
  type AlertDeal,
  getAlertThresholds,
  getClosingSoonDeals,
  getStaleDeals,
} from "@/lib/alerts";
import {
  addDays,
  addMonths,
  awstDateKey,
  awstDayKeyRange,
  DATE_KEY_PATTERN,
  type DateKey,
} from "@/lib/calendar";
import { formatAudFromCents, formatDateAwst, MS_PER_DAY } from "@/lib/format";
import { LOST_REASON_LABELS, type LostReason } from "@/lib/labels";
import {
  DEFAULT_REPORT_PERIOD_DAYS,
  REPORT_PERIOD_OPTIONS,
  type ReportOwnerOption,
} from "@/lib/report-filters";

// A deal's value, mirroring the pipeline board exactly so every surface
// reconciles (FR-1.4 / FR-8.2 AC): an accepted quote wins; otherwise the high
// end of the live options (draft/sent/viewed — declined are off the table);
// otherwise the estimate. Correlated subqueries, so this stays a per-deal
// scalar and never multiplies rows when summed or grouped.
//
// Exported so every report surface (pages, CSV export, trends) sums the SAME
// expression — any aggregate that bypasses this diverges from the dashboard
// and breaks the FR-8.2 reconciliation acceptance criterion.
export const dealValueCents = sql<number>`coalesce(
  (select max(${quote.valueCents}) from ${quote}
    where ${quote.dealId} = ${deal.id} and ${quote.status} = 'accepted'),
  (select max(${quote.valueCents}) from ${quote}
    where ${quote.dealId} = ${deal.id} and ${quote.status} in ('draft', 'sent', 'viewed')),
  ${deal.estimatedValueCents},
  0
)`;

const PERCENT = 100;

export const REPORT_WEEK_DAYS = 7;

// ---------------------------------------------------------------------------
// Shared report filters — every report page parses the same searchParams
// (?days | ?from/?to, ?owner, ?source) into this shape, and the aggregate
// queries below accept it, so a filter set means the same thing everywhere.
// ---------------------------------------------------------------------------

export type ReportLeadSource = (typeof leadSource.enumValues)[number];

export interface ReportSearchParams {
  days?: string;
  from?: string;
  owner?: string;
  source?: string;
  to?: string;
}

export interface ReportFilters {
  // UTC instant the period starts (inclusive).
  from: Date;
  // Original date keys when a custom range is active, for the date inputs.
  fromKey: DateKey | null;
  ownerId: string | null;
  // Pill highlight + "last N days" copy; meaningful only without a custom range.
  periodDays: number;
  source: ReportLeadSource | null;
  // Exclusive upper bound; null = up to now (period mode / open-ended range).
  to: Date | null;
  toKey: DateKey | null;
}

const isLeadSource = (value: string): value is ReportLeadSource =>
  (leadSource.enumValues as readonly string[]).includes(value);

export const parseReportFilters = (
  params: ReportSearchParams
): ReportFilters => {
  const parsedDays = Number(params.days);
  const periodDays = REPORT_PERIOD_OPTIONS.some((o) => o === parsedDays)
    ? parsedDays
    : DEFAULT_REPORT_PERIOD_DAYS;

  // A custom range needs a valid start; the end is optional (open-ended) and
  // ignored when it would invert the window. Keys are AWST calendar days.
  const fromKey =
    params.from && DATE_KEY_PATTERN.test(params.from) ? params.from : null;
  let toKey = params.to && DATE_KEY_PATTERN.test(params.to) ? params.to : null;
  if (!fromKey) {
    toKey = null;
  } else if (toKey && toKey < fromKey) {
    toKey = null;
  }

  const from = fromKey
    ? awstDayKeyRange(fromKey).start
    : new Date(Date.now() - periodDays * MS_PER_DAY);
  const to = toKey ? awstDayKeyRange(toKey).end : null;

  const source =
    params.source && isLeadSource(params.source) ? params.source : null;

  return {
    from,
    fromKey,
    ownerId: params.owner || null,
    periodDays,
    source,
    to,
    toKey,
  };
};

// Serialize active filters back into query params so links between report
// surfaces (pills, drill-downs, CSV export) carry the current filter set.
export const reportFilterParams = (filters: ReportFilters): URLSearchParams => {
  const params = new URLSearchParams();
  if (filters.fromKey) {
    params.set("from", filters.fromKey);
    if (filters.toKey) {
      params.set("to", filters.toKey);
    }
  } else if (filters.periodDays !== DEFAULT_REPORT_PERIOD_DAYS) {
    params.set("days", String(filters.periodDays));
  }
  if (filters.ownerId) {
    params.set("owner", filters.ownerId);
  }
  if (filters.source) {
    params.set("source", filters.source);
  }
  return params;
};

// Human label for the active window, e.g. "last 30 days" or "12 May – 2 Jun".
export const describeReportPeriod = (filters: ReportFilters): string => {
  if (!filters.fromKey) {
    return `last ${filters.periodDays} days`;
  }
  const fromLabel = formatDateAwst(filters.from);
  return filters.to
    ? `${fromLabel} – ${formatDateAwst(new Date(filters.to.getTime() - 1))}`
    : `since ${fromLabel}`;
};

// Owner/source conditions applied to the deal row. Date windows are NOT here:
// each aggregate applies its own (closedAt for win rate, createdAt for
// activity) because "the pipeline right now" has no date dimension.
const dealFilterConditions = (filters?: ReportFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters?.ownerId) {
    conditions.push(eq(deal.ownerId, filters.ownerId));
  }
  if (filters?.source) {
    conditions.push(eq(deal.source, filters.source));
  }
  return conditions;
};

export const getReportOwners = (): Promise<ReportOwnerOption[]> =>
  db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.disabled, false))
    .orderBy(asc(user.name));

// Resolve a stage id to its name for drill-down headings; null if deleted.
export const getStageName = async (stageId: string): Promise<string | null> => {
  const [row] = await db
    .select({ name: pipelineStage.name })
    .from(pipelineStage)
    .where(eq(pipelineStage.id, stageId))
    .limit(1);
  return row?.name ?? null;
};

// ---------------------------------------------------------------------------
// FR-8.1 — pipeline overview and forecast
// ---------------------------------------------------------------------------

export interface StageBreakdownRow {
  dealCount: number;
  isLost: boolean;
  isWon: boolean;
  stageId: string;
  stageName: string;
  totalCents: number;
  weightedCents: number;
  weighting: number;
}

export const getStageBreakdown = async (
  filters?: ReportFilters
): Promise<StageBreakdownRow[]> => {
  const rows = await db
    .select({
      stageId: pipelineStage.id,
      stageName: pipelineStage.name,
      weighting: pipelineStage.weighting,
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
      dealCount: count(deal.id),
      totalCents: sql<number>`coalesce(sum(${dealValueCents}), 0)`,
    })
    .from(pipelineStage)
    // Filters live in the join condition so filtered-out stages still return
    // as zero rows rather than disappearing from the board.
    .leftJoin(
      deal,
      and(
        eq(deal.stageId, pipelineStage.id),
        isNull(deal.deletedAt),
        ...dealFilterConditions(filters)
      )
    )
    .groupBy(pipelineStage.id)
    .orderBy(asc(pipelineStage.position));

  return rows.map((row) => ({
    ...row,
    totalCents: Number(row.totalCents),
    weightedCents: Math.round(
      (Number(row.totalCents) * row.weighting) / PERCENT
    ),
  }));
};

export interface PipelineTotals {
  openCount: number;
  openTotalCents: number;
  weightedTotalCents: number;
}

// Open pipeline = every stage that is neither Won nor Lost / Dormant (FR-1.6).
export const summarisePipeline = (
  breakdown: StageBreakdownRow[]
): PipelineTotals => {
  const openStages = breakdown.filter((row) => !(row.isWon || row.isLost));
  return {
    openCount: openStages.reduce((sum, row) => sum + row.dealCount, 0),
    openTotalCents: openStages.reduce((sum, row) => sum + row.totalCents, 0),
    weightedTotalCents: openStages.reduce(
      (sum, row) => sum + row.weightedCents,
      0
    ),
  };
};

// ---------------------------------------------------------------------------
// On-hold / blocked deals — how many deals are stalled and their value
// ---------------------------------------------------------------------------

export interface SubStatusBreakdownRow {
  color: string;
  dealCount: number;
  label: string;
  subStatusId: string;
  totalCents: number;
}

export const getSubStatusBreakdown = async (
  filters?: ReportFilters
): Promise<SubStatusBreakdownRow[]> => {
  const rows = await db
    .select({
      subStatusId: deal.subStatusId,
      label: dealSubStatus.label,
      color: dealSubStatus.color,
      dealCount: count(deal.id),
      totalCents: sql<number>`coalesce(sum(${dealValueCents}), 0)`,
    })
    .from(deal)
    .innerJoin(dealSubStatus, eq(deal.subStatusId, dealSubStatus.id))
    .where(
      and(
        isNull(deal.deletedAt),
        isNotNull(deal.subStatusId),
        ...dealFilterConditions(filters)
      )
    )
    .groupBy(deal.subStatusId, dealSubStatus.label, dealSubStatus.color)
    .orderBy(desc(count(deal.id)));

  const breakdown: SubStatusBreakdownRow[] = [];
  for (const row of rows) {
    if (!row.subStatusId) {
      continue;
    }
    breakdown.push({
      subStatusId: row.subStatusId,
      label: row.label,
      color: row.color,
      dealCount: row.dealCount,
      totalCents: Number(row.totalCents),
    });
  }
  return breakdown;
};

// ---------------------------------------------------------------------------
// FR-8.1 — win rate with lost-reason breakdown
// ---------------------------------------------------------------------------

export interface WinRateSummary {
  lostCount: number;
  lostReasons: { count: number; label: string }[];
  winRatePercent: number | null;
  wonCount: number;
  wonValueCents: number;
}

export const getWinRate = async (
  since: Date,
  filters?: ReportFilters
): Promise<WinRateSummary> => {
  const closed = await db
    .select({
      isWon: pipelineStage.isWon,
      lostReason: deal.lostReason,
      valueCents: dealValueCents,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(
      and(
        isNull(deal.deletedAt),
        gte(deal.closedAt, since),
        ...(filters?.to ? [lt(deal.closedAt, filters.to)] : []),
        ...dealFilterConditions(filters)
      )
    );

  let wonCount = 0;
  let wonValueCents = 0;
  let lostCount = 0;
  const reasonCounts = new Map<LostReason, number>();

  for (const row of closed) {
    if (row.isWon) {
      wonCount += 1;
      wonValueCents += Number(row.valueCents);
    } else {
      lostCount += 1;
      if (row.lostReason) {
        reasonCounts.set(
          row.lostReason,
          (reasonCounts.get(row.lostReason) ?? 0) + 1
        );
      }
    }
  }

  const decided = wonCount + lostCount;
  return {
    wonCount,
    wonValueCents,
    lostCount,
    winRatePercent:
      decided > 0 ? Math.round((wonCount / decided) * PERCENT) : null,
    lostReasons: [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, reasonCount]) => ({
        label: LOST_REASON_LABELS[reason],
        count: reasonCount,
      })),
  };
};

// ---------------------------------------------------------------------------
// FR-8.1 — activity volume per person
// ---------------------------------------------------------------------------

export interface ActivityVolumeRow {
  activityCount: number;
  personName: string;
}

export const getActivityVolume = async (
  since: Date,
  filters?: ReportFilters
): Promise<ActivityVolumeRow[]> => {
  // Owner/source filters describe deals, so scoping activity by them needs
  // the deal row; join it only when a filter is actually set.
  const scopedByDeal = Boolean(filters?.ownerId || filters?.source);
  const base = db
    .select({
      personName: user.name,
      activityCount: count(activity.id),
    })
    .from(activity)
    .leftJoin(user, eq(activity.createdBy, user.id));
  const rows = await (scopedByDeal
    ? base.innerJoin(
        deal,
        and(eq(activity.dealId, deal.id), ...dealFilterConditions(filters))
      )
    : base
  )
    .where(
      and(
        gte(activity.createdAt, since),
        ...(filters?.to ? [lt(activity.createdAt, filters.to)] : [])
      )
    )
    .groupBy(user.name)
    .orderBy(desc(count(activity.id)));

  // Activity logged before per-user attribution lands groups under one row.
  return rows.map((row) => ({
    personName: row.personName ?? "Unattributed",
    activityCount: row.activityCount,
  }));
};

// ---------------------------------------------------------------------------
// Trends & forecast (/reports/trends) — deals created and closed over time,
// weighted forecast by expected close month, and slipped deals. Buckets are
// AWST calendar weeks/months: date_trunc runs on the Perth-local timestamp so
// week boundaries land on Perth Mondays, matching awstDayKeyRange semantics.
// ---------------------------------------------------------------------------

const AWST_TZ = "Australia/Perth";

export type TrendBucket = "month" | "week";

// Beyond ~four months of range, weekly bars get too thin to read on a phone.
const WEEKLY_BUCKET_MAX_DAYS = 120;

export const trendBucketFor = (filters: ReportFilters): TrendBucket => {
  const end = filters.to ?? new Date();
  const rangeDays = (end.getTime() - filters.from.getTime()) / MS_PER_DAY;
  return rangeDays > WEEKLY_BUCKET_MAX_DAYS ? "month" : "week";
};

// Bucket start as an AWST-local YYYY-MM-DD key (month buckets use the 1st).
// The bucket keyword and timezone are inlined (sql.raw), NOT bound parameters:
// the same expression must appear in SELECT and GROUP BY, and with parameters
// each occurrence gets a different placeholder number, so Postgres treats them
// as different expressions and rejects the query. Both values are internal
// constants, never user input.
const trendBucketKey = (
  bucket: TrendBucket,
  column: SQL | (typeof deal)["createdAt"]
): SQL<string> =>
  sql<string>`to_char(date_trunc(${sql.raw(`'${bucket}'`)}, ${column} at time zone ${sql.raw(`'${AWST_TZ}'`)}), 'YYYY-MM-DD')`;

const DAYS_PER_WEEK = 7;

// Monday of the AWST week containing the key (getUTCDay: 0 = Sunday).
const weekStartKey = (key: DateKey): DateKey => {
  const weekday = new Date(Date.parse(`${key}T00:00:00Z`)).getUTCDay();
  return addDays(key, -((weekday + 6) % DAYS_PER_WEEK));
};

const monthStartKey = (key: DateKey): DateKey => `${key.slice(0, 7)}-01`;

// Every bucket key the filter window spans, so charts render empty periods
// as zeros instead of skipping them.
export const trendBucketKeys = (
  bucket: TrendBucket,
  filters: ReportFilters
): DateKey[] => {
  const end = filters.to ? new Date(filters.to.getTime() - 1) : new Date();
  const startKey =
    bucket === "week"
      ? weekStartKey(awstDateKey(filters.from))
      : monthStartKey(awstDateKey(filters.from));
  const endKey =
    bucket === "week"
      ? weekStartKey(awstDateKey(end))
      : monthStartKey(awstDateKey(end));

  const keys: DateKey[] = [];
  let cursor = startKey;
  while (cursor <= endKey) {
    keys.push(cursor);
    cursor =
      bucket === "week"
        ? addDays(cursor, DAYS_PER_WEEK)
        : `${addMonths(cursor.slice(0, 7), 1)}-01`;
  }
  return keys;
};

export interface CreatedTrendRow {
  bucketKey: DateKey;
  count: number;
  totalCents: number;
}

export const getCreatedTrend = async (
  filters: ReportFilters,
  bucket: TrendBucket
): Promise<CreatedTrendRow[]> => {
  const bucketExpr = trendBucketKey(bucket, deal.createdAt);
  const rows = await db
    .select({
      bucketKey: bucketExpr,
      count: count(deal.id),
      totalCents: sql<number>`coalesce(sum(${dealValueCents}), 0)`,
    })
    .from(deal)
    .where(
      and(
        isNull(deal.deletedAt),
        gte(deal.createdAt, filters.from),
        ...(filters.to ? [lt(deal.createdAt, filters.to)] : []),
        ...dealFilterConditions(filters)
      )
    )
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  return rows.map((row) => ({ ...row, totalCents: Number(row.totalCents) }));
};

export interface ClosedTrendRow {
  bucketKey: DateKey;
  lostCount: number;
  wonCount: number;
  wonValueCents: number;
}

export const getClosedTrend = async (
  filters: ReportFilters,
  bucket: TrendBucket
): Promise<ClosedTrendRow[]> => {
  const bucketExpr = trendBucketKey(bucket, sql`${deal.closedAt}`);
  const rows = await db
    .select({
      bucketKey: bucketExpr,
      isWon: pipelineStage.isWon,
      count: count(deal.id),
      totalCents: sql<number>`coalesce(sum(${dealValueCents}), 0)`,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(
      and(
        isNull(deal.deletedAt),
        gte(deal.closedAt, filters.from),
        ...(filters.to ? [lt(deal.closedAt, filters.to)] : []),
        ...dealFilterConditions(filters)
      )
    )
    .groupBy(bucketExpr, pipelineStage.isWon)
    .orderBy(bucketExpr);

  const byBucket = new Map<DateKey, ClosedTrendRow>();
  for (const row of rows) {
    const entry = byBucket.get(row.bucketKey) ?? {
      bucketKey: row.bucketKey,
      lostCount: 0,
      wonCount: 0,
      wonValueCents: 0,
    };
    if (row.isWon) {
      entry.wonCount += row.count;
      entry.wonValueCents += Number(row.totalCents);
    } else {
      entry.lostCount += row.count;
    }
    byBucket.set(row.bucketKey, entry);
  }
  return [...byBucket.values()];
};

export interface ForecastMonthRow {
  count: number;
  // AWST YYYY-MM, or null for open deals with no expected close date.
  monthKey: string | null;
  totalCents: number;
  weightedCents: number;
}

export const getForecastByMonth = async (
  filters?: ReportFilters
): Promise<ForecastMonthRow[]> => {
  // Timezone inlined for the same SELECT/GROUP BY matching reason as
  // trendBucketKey above.
  const monthExpr = sql<
    string | null
  >`to_char(date_trunc('month', ${deal.expectedCloseDate} at time zone ${sql.raw(`'${AWST_TZ}'`)}), 'YYYY-MM')`;
  const rows = await db
    .select({
      monthKey: monthExpr,
      count: count(deal.id),
      totalCents: sql<number>`coalesce(sum(${dealValueCents}), 0)`,
      weightedCents: sql<number>`coalesce(sum(${dealValueCents} * ${pipelineStage.weighting} / ${PERCENT}), 0)`,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(
      and(
        isNull(deal.deletedAt),
        eq(pipelineStage.isWon, false),
        eq(pipelineStage.isLost, false),
        ...dealFilterConditions(filters)
      )
    )
    .groupBy(monthExpr)
    .orderBy(sql`${monthExpr} nulls last`);

  return rows.map((row) => ({
    ...row,
    totalCents: Number(row.totalCents),
    weightedCents: Number(row.weightedCents),
  }));
};

export interface SlippedDealRow {
  companyName: string | null;
  daysOverdue: number;
  expectedCloseDate: Date;
  id: string;
  leadId: string;
  stageName: string;
  title: string;
  valueCents: number;
}

const SLIPPED_DEALS_LIMIT = 50;

// Open deals whose expected close date has passed — forecast slippage.
export const getSlippedDeals = async (
  filters?: ReportFilters
): Promise<SlippedDealRow[]> => {
  const now = new Date();
  const rows = await db
    .select({
      id: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      companyName: company.name,
      stageName: pipelineStage.name,
      valueCents: dealValueCents,
      expectedCloseDate: deal.expectedCloseDate,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .where(
      and(
        isNull(deal.deletedAt),
        eq(pipelineStage.isWon, false),
        eq(pipelineStage.isLost, false),
        isNotNull(deal.expectedCloseDate),
        lt(deal.expectedCloseDate, now),
        ...dealFilterConditions(filters)
      )
    )
    .orderBy(asc(deal.expectedCloseDate))
    .limit(SLIPPED_DEALS_LIMIT);

  const slipped: SlippedDealRow[] = [];
  for (const row of rows) {
    if (!row.expectedCloseDate) {
      continue;
    }
    slipped.push({
      ...row,
      expectedCloseDate: row.expectedCloseDate,
      valueCents: Number(row.valueCents),
      daysOverdue: Math.floor(
        (now.getTime() - row.expectedCloseDate.getTime()) / MS_PER_DAY
      ),
    });
  }
  return slipped;
};

// ---------------------------------------------------------------------------
// Funnel & stage velocity (/reports/funnel) — built on deal_stage_event.
// The cohort is "deals created inside the filter window"; a deal counts as
// having reached a stage if any of its stage events landed on that stage's
// position or later (so stage-skipping deals still count), with Won as the
// terminal step. Events whose stage was later deleted resolve to no current
// stage and are excluded, which the page discloses via the data-quality note.
// ---------------------------------------------------------------------------

const SECONDS_PER_DAY = 86_400;

// The cohort filter shared by both funnel queries.
const funnelCohortWhere = (filters: ReportFilters) =>
  and(
    isNull(deal.deletedAt),
    gte(deal.createdAt, filters.from),
    ...(filters.to ? [lt(deal.createdAt, filters.to)] : []),
    ...dealFilterConditions(filters)
  );

export interface FunnelStep {
  // Percentage of the previous step that made it here; null for the first.
  conversionFromPrevious: number | null;
  reachedCount: number;
  // null for the terminal Won step (it is an outcome, not a board stage).
  stageId: string | null;
  stageName: string;
}

export interface FunnelConversion {
  cohortCount: number;
  steps: FunnelStep[];
}

const PERCENT_ROUND = 100;

export const getFunnelConversion = async (
  filters: ReportFilters
): Promise<FunnelConversion> => {
  const result = await db.execute(sql`
    with cohort as (
      select ${deal.id} as id from ${deal} where ${funnelCohortWhere(filters)}
    ),
    reached as (
      select e.deal_id,
        max(ps.position)
          filter (where not ps.is_won and not ps.is_lost) as max_open_position,
        bool_or(ps.is_won) as reached_won
      from ${dealStageEvent} e
      join ${pipelineStage} ps on ps.id = e.to_stage_id
      where e.deal_id in (select id from cohort)
      group by e.deal_id
    )
    select ps.id as stage_id, ps.name as stage_name, ps.position,
      (select count(*) from reached r
        where r.max_open_position >= ps.position or r.reached_won
      )::int as reached_count,
      (select count(*) from reached r where r.reached_won)::int as won_count,
      (select count(*) from cohort)::int as cohort_count
    from ${pipelineStage} ps
    where not ps.is_won and not ps.is_lost
    order by ps.position
  `);

  const rows = result.rows as {
    cohort_count: number;
    reached_count: number;
    stage_id: string;
    stage_name: string;
    won_count: number;
  }[];

  const cohortCount = rows[0] ? Number(rows[0].cohort_count) : 0;
  const wonCount = rows[0] ? Number(rows[0].won_count) : 0;

  const steps: FunnelStep[] = [];
  for (const row of rows) {
    const reachedCount = Number(row.reached_count);
    const previous = steps.at(-1);
    steps.push({
      stageId: row.stage_id,
      stageName: row.stage_name,
      reachedCount,
      conversionFromPrevious:
        previous && previous.reachedCount > 0
          ? Math.round((reachedCount / previous.reachedCount) * PERCENT_ROUND)
          : null,
    });
  }
  const lastOpen = steps.at(-1);
  steps.push({
    stageId: null,
    stageName: "Won",
    reachedCount: wonCount,
    conversionFromPrevious:
      lastOpen && lastOpen.reachedCount > 0
        ? Math.round((wonCount / lastOpen.reachedCount) * PERCENT_ROUND)
        : null,
  });

  return { cohortCount, steps };
};

export interface StageVelocityRow {
  // Mean/median days a deal spent in the stage before moving on.
  avgDays: number | null;
  completedCount: number;
  // Deals from the cohort sitting in the stage right now, and for how long.
  currentAvgDays: number | null;
  currentCount: number;
  medianDays: number | null;
  stageId: string;
  stageName: string;
}

export const getStageVelocity = async (
  filters: ReportFilters
): Promise<StageVelocityRow[]> => {
  const result = await db.execute(sql`
    with cohort as (
      select ${deal.id} as id from ${deal} where ${funnelCohortWhere(filters)}
    ),
    spans as (
      select e.deal_id, e.to_stage_id, e.changed_at,
        lead(e.changed_at) over (
          partition by e.deal_id order by e.changed_at, e.id
        ) as left_at
      from ${dealStageEvent} e
      where e.deal_id in (select id from cohort)
    )
    select ps.id as stage_id, ps.name as stage_name, ps.position,
      count(*) filter (where s.left_at is not null)::int as completed_count,
      avg(extract(epoch from s.left_at - s.changed_at))
        filter (where s.left_at is not null) as avg_seconds,
      percentile_cont(0.5) within group (
        order by extract(epoch from s.left_at - s.changed_at)
      ) filter (where s.left_at is not null) as median_seconds,
      count(*) filter (where s.left_at is null)::int as current_count,
      avg(extract(epoch from now() - s.changed_at))
        filter (where s.left_at is null) as current_avg_seconds
    from spans s
    join ${pipelineStage} ps on ps.id = s.to_stage_id
    where not ps.is_won and not ps.is_lost
    group by ps.id, ps.name, ps.position
    order by ps.position
  `);

  const toDays = (seconds: unknown): number | null =>
    seconds === null || seconds === undefined
      ? null
      : Number(seconds) / SECONDS_PER_DAY;

  return (
    result.rows as {
      avg_seconds: string | null;
      completed_count: number;
      current_avg_seconds: string | null;
      current_count: number;
      median_seconds: string | null;
      stage_id: string;
      stage_name: string;
    }[]
  ).map((row) => ({
    stageId: row.stage_id,
    stageName: row.stage_name,
    completedCount: Number(row.completed_count),
    avgDays: toDays(row.avg_seconds),
    medianDays: toDays(row.median_seconds),
    currentCount: Number(row.current_count),
    currentAvgDays: toDays(row.current_avg_seconds),
  }));
};

export interface StageEventQuality {
  // Oldest event written by a live hook; history before this is backfilled.
  firstLiveAt: Date | null;
  hasBackfill: boolean;
}

export const getStageEventQuality = async (): Promise<StageEventQuality> => {
  const result = await db.execute(sql`
    select bool_or(${dealStageEvent.source} = 'backfill') as has_backfill,
      min(${dealStageEvent.changedAt})
        filter (where ${dealStageEvent.source} <> 'backfill') as first_live
    from ${dealStageEvent}
  `);
  const [row] = result.rows as {
    first_live: string | null;
    has_backfill: boolean | null;
  }[];
  return {
    hasBackfill: Boolean(row?.has_backfill),
    firstLiveAt: row?.first_live ? new Date(row.first_live) : null,
  };
};

// ---------------------------------------------------------------------------
// Team & quotes (/reports/team) — quote pipeline conversion and per-person
// activity/follow-through. Quote window keys on quote.createdAt; follow-up
// window keys on dueDate (the period the work was due, not when it was set).
// ---------------------------------------------------------------------------

export interface QuoteFunnel {
  acceptedCount: number;
  acceptedValueCents: number;
  // Sent → accepted decision lag, accepted quotes only.
  avgDaysSentToResponse: number | null;
  avgDaysSentToViewed: number | null;
  declinedCount: number;
  draftCount: number;
  sentCount: number;
  totalCount: number;
  viewedCount: number;
}

export const getQuoteFunnel = async (
  filters: ReportFilters
): Promise<QuoteFunnel> => {
  const [row] = await db
    .select({
      totalCount: count(quote.id),
      draftCount: sql<number>`count(*) filter (where ${quote.status} = 'draft')`,
      sentCount: sql<number>`count(${quote.sentAt})`,
      viewedCount: sql<number>`count(${quote.viewedAt})`,
      acceptedCount: sql<number>`count(*) filter (where ${quote.status} = 'accepted')`,
      declinedCount: sql<number>`count(*) filter (where ${quote.status} = 'declined')`,
      acceptedValueCents: sql<number>`coalesce(sum(${quote.valueCents}) filter (where ${quote.status} = 'accepted'), 0)`,
      avgSecondsSentToViewed: sql<
        string | null
      >`avg(extract(epoch from ${quote.viewedAt} - ${quote.sentAt}))`,
      avgSecondsSentToResponse: sql<
        string | null
      >`avg(extract(epoch from ${quote.respondedAt} - ${quote.sentAt})) filter (where ${quote.status} = 'accepted')`,
    })
    .from(quote)
    .innerJoin(deal, eq(quote.dealId, deal.id))
    .where(
      and(
        isNull(deal.deletedAt),
        gte(quote.createdAt, filters.from),
        ...(filters.to ? [lt(quote.createdAt, filters.to)] : []),
        ...dealFilterConditions(filters)
      )
    );

  const toDays = (seconds: string | null): number | null =>
    seconds === null ? null : Number(seconds) / SECONDS_PER_DAY;

  return {
    totalCount: Number(row?.totalCount ?? 0),
    draftCount: Number(row?.draftCount ?? 0),
    sentCount: Number(row?.sentCount ?? 0),
    viewedCount: Number(row?.viewedCount ?? 0),
    acceptedCount: Number(row?.acceptedCount ?? 0),
    declinedCount: Number(row?.declinedCount ?? 0),
    acceptedValueCents: Number(row?.acceptedValueCents ?? 0),
    avgDaysSentToViewed: toDays(row?.avgSecondsSentToViewed ?? null),
    avgDaysSentToResponse: toDays(row?.avgSecondsSentToResponse ?? null),
  };
};

export interface ActivityMixRow {
  countsByType: Record<string, number>;
  personName: string;
  totalCount: number;
}

export const getActivityMix = async (
  filters: ReportFilters
): Promise<ActivityMixRow[]> => {
  // Owner/source filters describe deals, so scoping needs the deal row; join
  // it only when a filter is actually set (matches getActivityVolume).
  const scopedByDeal = Boolean(filters.ownerId || filters.source);
  const base = db
    .select({
      personName: user.name,
      type: activity.type,
      typeCount: count(activity.id),
    })
    .from(activity)
    .leftJoin(user, eq(activity.createdBy, user.id));
  const rows = await (scopedByDeal
    ? base.innerJoin(
        deal,
        and(eq(activity.dealId, deal.id), ...dealFilterConditions(filters))
      )
    : base
  )
    .where(
      and(
        gte(activity.createdAt, filters.from),
        ...(filters.to ? [lt(activity.createdAt, filters.to)] : [])
      )
    )
    .groupBy(user.name, activity.type);

  const byPerson = new Map<string, ActivityMixRow>();
  for (const row of rows) {
    const personName = row.personName ?? "Unattributed";
    const entry = byPerson.get(personName) ?? {
      personName,
      totalCount: 0,
      countsByType: {},
    };
    entry.countsByType[row.type] = row.typeCount;
    entry.totalCount += row.typeCount;
    byPerson.set(personName, entry);
  }
  return [...byPerson.values()].sort((a, b) => b.totalCount - a.totalCount);
};

export interface FollowUpStatsRow {
  completedCount: number;
  onTimeCount: number;
  overdueOpenCount: number;
  personName: string;
  totalCount: number;
}

export const getFollowUpStats = async (
  filters: ReportFilters
): Promise<FollowUpStatsRow[]> => {
  const rows = await db
    .select({
      personName: user.name,
      totalCount: count(followUp.id),
      completedCount: sql<number>`count(${followUp.completedAt})`,
      onTimeCount: sql<number>`count(*) filter (where ${followUp.completedAt} <= ${followUp.dueDate})`,
      overdueOpenCount: sql<number>`count(*) filter (where ${followUp.completedAt} is null and ${followUp.dueDate} < now())`,
    })
    .from(followUp)
    .leftJoin(user, eq(followUp.ownerId, user.id))
    .innerJoin(
      deal,
      and(
        eq(followUp.dealId, deal.id),
        isNull(deal.deletedAt),
        ...dealFilterConditions(filters)
      )
    )
    .where(
      and(
        gte(followUp.dueDate, filters.from),
        ...(filters.to ? [lt(followUp.dueDate, filters.to)] : [])
      )
    )
    .groupBy(user.name)
    .orderBy(desc(count(followUp.id)));

  return rows.map((row) => ({
    personName: row.personName ?? "Unassigned",
    totalCount: Number(row.totalCount),
    completedCount: Number(row.completedCount),
    onTimeCount: Number(row.onTimeCount),
    overdueOpenCount: Number(row.overdueOpenCount),
  }));
};

// ---------------------------------------------------------------------------
// Drill-down — the deals behind a report number (/reports/deals)
// ---------------------------------------------------------------------------

export interface ReportDealListRow {
  closedAt: Date | null;
  companyName: string | null;
  createdAt: Date;
  expectedCloseDate: Date | null;
  id: string;
  leadId: string;
  ownerName: string | null;
  stageName: string;
  title: string;
  valueCents: number;
}

export interface ReportDealsQuery {
  filters: ReportFilters;
  // Restrict to open (not Won / Lost) stages — the pipeline drill-down.
  open?: boolean;
  // Closed with this outcome inside the filter window — the win-rate drill-down.
  outcome?: "lost" | "won";
  stageId?: string;
  subStatusId?: string;
}

const REPORT_DEALS_LIMIT = 200;
const REPORT_ACTIONS_LIMIT = 200;

export const getReportDeals = async (
  query: ReportDealsQuery
): Promise<ReportDealListRow[]> => {
  const { filters } = query;
  const conditions: SQL[] = [
    isNull(deal.deletedAt),
    ...dealFilterConditions(filters),
  ];
  if (query.stageId) {
    conditions.push(eq(deal.stageId, query.stageId));
  }
  if (query.subStatusId) {
    conditions.push(eq(deal.subStatusId, query.subStatusId));
  }
  if (query.open) {
    conditions.push(
      eq(pipelineStage.isWon, false),
      eq(pipelineStage.isLost, false)
    );
  }
  if (query.outcome) {
    conditions.push(
      eq(
        query.outcome === "won" ? pipelineStage.isWon : pipelineStage.isLost,
        true
      ),
      gte(deal.closedAt, filters.from)
    );
    if (filters.to) {
      conditions.push(lt(deal.closedAt, filters.to));
    }
  }

  const rows = await db
    .select({
      id: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      companyName: company.name,
      stageName: pipelineStage.name,
      ownerName: user.name,
      valueCents: dealValueCents,
      createdAt: deal.createdAt,
      closedAt: deal.closedAt,
      expectedCloseDate: deal.expectedCloseDate,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .leftJoin(user, eq(deal.ownerId, user.id))
    .where(and(...conditions))
    .orderBy(desc(dealValueCents), asc(deal.title))
    .limit(REPORT_DEALS_LIMIT);

  return rows.map((row) => ({ ...row, valueCents: Number(row.valueCents) }));
};

// ---------------------------------------------------------------------------
// FR-8.2 — weekly pipeline report (Monday snapshot)
// ---------------------------------------------------------------------------

export interface ReportDealRow {
  companyName: string | null;
  handoverToDelivery: boolean;
  id: string;
  leadId: string;
  lostReason: string | null;
  stageId: string;
  title: string;
  valueCents: number;
}

export interface ReportActionRow {
  action: string;
  dealId: string;
  dealTitle: string;
  dueDate: Date;
  id: string;
  ownerName: string | null;
}

export interface WeeklyReport {
  actions: ReportActionRow[];
  closingSoon: AlertDeal[];
  closingSoonDays: number;
  generatedAt: Date;
  lostThisWeek: ReportDealRow[];
  needsAttention: AlertDeal[];
  newThisWeek: number;
  openByStage: { deals: ReportDealRow[]; stage: StageBreakdownRow }[];
  staleDays: number;
  totals: PipelineTotals;
  weekStart: Date;
  wonThisWeek: ReportDealRow[];
}

const reportDealColumns = {
  id: deal.id,
  leadId: deal.leadId,
  title: deal.title,
  companyName: company.name,
  stageId: deal.stageId,
  valueCents: dealValueCents,
  handoverToDelivery: deal.handoverToDelivery,
  lostReason: deal.lostReason,
};

const toReportDealRow = (
  row: Omit<ReportDealRow, "valueCents" | "lostReason"> & {
    lostReason: LostReason | null;
    valueCents: number;
  }
): ReportDealRow => ({
  ...row,
  valueCents: Number(row.valueCents),
  lostReason: row.lostReason ? LOST_REASON_LABELS[row.lostReason] : null,
});

// The snapshot covers the trailing seven days so a Monday-morning run reads
// as last week; using the same helpers as /reports keeps the numbers
// reconciled (FR-8.2 AC).
export const getWeeklyReport = async (
  now: Date = new Date()
): Promise<WeeklyReport> => {
  const weekStart = new Date(now.getTime() - REPORT_WEEK_DAYS * MS_PER_DAY);
  const actionsHorizon = new Date(
    now.getTime() + REPORT_WEEK_DAYS * MS_PER_DAY
  );

  // Two waves rather than eight serial round trips: stacked sequential Neon
  // queries in one render have caused production 503s on workerd. Only the
  // two alert lists depend on thresholds, so they wait for wave 1. Result
  // sets are capped at the report limits; ordering puts the rows that matter
  // (top-of-funnel stages, largest values, soonest actions) before the cut.
  const [
    thresholds,
    breakdown,
    [newThisWeek],
    openDeals,
    closedThisWeek,
    actions,
  ] = await Promise.all([
    getAlertThresholds(),
    getStageBreakdown(),
    db
      .select({ value: count(deal.id) })
      .from(deal)
      .where(and(isNull(deal.deletedAt), gte(deal.createdAt, weekStart))),
    db
      .select(reportDealColumns)
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .leftJoin(company, eq(deal.companyId, company.id))
      .where(
        and(
          isNull(deal.deletedAt),
          eq(pipelineStage.isWon, false),
          eq(pipelineStage.isLost, false)
        )
      )
      .orderBy(asc(pipelineStage.position), desc(dealValueCents))
      .limit(REPORT_DEALS_LIMIT),
    db
      .select({ ...reportDealColumns, isWon: pipelineStage.isWon })
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .leftJoin(company, eq(deal.companyId, company.id))
      .where(and(isNull(deal.deletedAt), gte(deal.closedAt, weekStart)))
      .orderBy(desc(dealValueCents))
      .limit(REPORT_DEALS_LIMIT),
    db
      .select({
        id: followUp.id,
        action: followUp.action,
        dueDate: followUp.dueDate,
        ownerName: user.name,
        dealId: deal.id,
        dealTitle: deal.title,
      })
      .from(followUp)
      .innerJoin(deal, eq(followUp.dealId, deal.id))
      .leftJoin(user, eq(followUp.ownerId, user.id))
      .where(
        and(
          isNull(followUp.completedAt),
          isNull(deal.deletedAt),
          lt(followUp.dueDate, actionsHorizon)
        )
      )
      .orderBy(asc(followUp.dueDate))
      .limit(REPORT_ACTIONS_LIMIT),
  ]);

  const [needsAttention, closingSoon] = await Promise.all([
    getStaleDeals(thresholds.staleDays),
    getClosingSoonDeals(thresholds.closingSoonDays),
  ]);

  const openStages = breakdown.filter((row) => !(row.isWon || row.isLost));
  const openByStage = openStages.map((stage) => ({
    stage,
    deals: openDeals
      .filter((row) => row.stageId === stage.stageId)
      .map(toReportDealRow),
  }));

  return {
    generatedAt: now,
    weekStart,
    totals: summarisePipeline(breakdown),
    newThisWeek: newThisWeek?.value ?? 0,
    wonThisWeek: closedThisWeek.filter((row) => row.isWon).map(toReportDealRow),
    lostThisWeek: closedThisWeek
      .filter((row) => !row.isWon)
      .map(toReportDealRow),
    needsAttention,
    closingSoon,
    openByStage,
    actions,
    staleDays: thresholds.staleDays,
    closingSoonDays: thresholds.closingSoonDays,
  };
};

// Plain-text rendition in Blu's existing format, for copy-and-share into
// email or WhatsApp until the AI artifact flow (M4) takes over.
export const renderWeeklyReportText = (report: WeeklyReport): string => {
  const money = (cents: number) => formatAudFromCents(cents);
  const dealLine = (row: ReportDealRow, extra?: string | null) =>
    `- ${row.leadId} ${row.title} (${row.companyName ?? "no company"}) — ${money(row.valueCents)}${extra ? ` — ${extra}` : ""}`;

  const lines: string[] = [
    `WEEKLY PIPELINE REPORT — ${formatDateAwst(report.generatedAt)}`,
    `Covers ${formatDateAwst(report.weekStart)} to ${formatDateAwst(report.generatedAt)} (Private and Confidential)`,
    "",
    "1. SUMMARY",
    `- Active leads: ${report.totals.openCount}`,
    `- Open pipeline: ${money(report.totals.openTotalCents)} (weighted ${money(report.totals.weightedTotalCents)})`,
    `- New this week: ${report.newThisWeek}`,
    `- Won this week: ${report.wonThisWeek.length}`,
    `- Lost / dormant this week: ${report.lostThisWeek.length}`,
    "",
    `2. CLOSING SOON (within ${report.closingSoonDays} days)`,
    ...(report.closingSoon.length === 0
      ? ["- None"]
      : report.closingSoon.map((row) => {
          const keyDate = row.fixedDate ?? row.expectedCloseDate;
          return `- ${row.leadId} ${row.title} (${row.companyName ?? "no company"}) — ${row.stageName}${keyDate ? ` — ${formatDateAwst(keyDate)}` : ""}`;
        })),
    "",
    `3. NEEDS ATTENTION (no contact ${report.staleDays}+ days)`,
    ...(report.needsAttention.length === 0
      ? ["- None"]
      : report.needsAttention.map(
          (row) =>
            `- ${row.leadId} ${row.title} (${row.companyName ?? "no company"}) — ${row.stageName} — last contact ${formatDateAwst(row.lastContactAt ?? row.createdAt)}`
        )),
    "",
    "4. FULL PIPELINE BY STAGE",
    ...report.openByStage.flatMap(({ stage, deals }) => [
      `${stage.stageName} — ${stage.dealCount} deal${stage.dealCount === 1 ? "" : "s"}, ${money(stage.totalCents)}`,
      ...(deals.length === 0 ? ["- None"] : deals.map((row) => dealLine(row))),
    ]),
    "",
    "5. WON THIS WEEK",
    ...(report.wonThisWeek.length === 0
      ? ["- None"]
      : report.wonThisWeek.map((row) =>
          dealLine(
            row,
            row.handoverToDelivery
              ? "handed over to delivery"
              : "handover pending"
          )
        )),
    "",
    "6. LOST / DORMANT THIS WEEK",
    ...(report.lostThisWeek.length === 0
      ? ["- None"]
      : report.lostThisWeek.map((row) =>
          dealLine(row, row.lostReason ? `reason: ${row.lostReason}` : null)
        )),
    "",
    "7. ACTIONS FOR THE WEEK",
    ...(report.actions.length === 0
      ? ["- None"]
      : report.actions.map(
          (row) =>
            `- ${row.ownerName ?? "Unassigned"}: ${row.action} (${row.dealTitle}) — due ${formatDateAwst(row.dueDate)}`
        )),
  ];

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Daily status — what was accomplished on each deal on a given AWST day
// ---------------------------------------------------------------------------

export interface DailyDealActivity {
  companyName: string | null;
  dealId: string;
  entries: TimelineEntry[];
  leadId: string;
  stageName: string;
  title: string;
}

// Every activity logged on the chosen Perth day, grouped per deal. The
// activity table is the event-sourced timeline (calls, notes, stage changes,
// quote events, completed follow-ups), so a day window over createdAt is the
// full picture of the day's work. Deal groups are ordered by their most recent
// activity (most recently worked first); entries stay chronological within.
export const getDailyActivity = async (
  dateKey: DateKey
): Promise<DailyDealActivity[]> => {
  const { start, end } = awstDayKeyRange(dateKey);

  const rows = await db
    .select({
      activityId: activity.id,
      type: activity.type,
      content: activity.content,
      createdAt: activity.createdAt,
      authorName: user.name,
      dealId: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      companyName: company.name,
      stageName: pipelineStage.name,
    })
    .from(activity)
    .innerJoin(deal, and(eq(activity.dealId, deal.id), isNull(deal.deletedAt)))
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .leftJoin(user, eq(activity.createdBy, user.id))
    .where(and(gte(activity.createdAt, start), lt(activity.createdAt, end)))
    .orderBy(asc(activity.createdAt));

  const byDeal = new Map<string, DailyDealActivity>();
  for (const row of rows) {
    const group = byDeal.get(row.dealId);
    const entry: TimelineEntry = {
      id: row.activityId,
      type: row.type,
      content: row.content,
      createdAt: row.createdAt,
      authorName: row.authorName,
    };
    if (group) {
      group.entries.push(entry);
    } else {
      byDeal.set(row.dealId, {
        dealId: row.dealId,
        leadId: row.leadId,
        title: row.title,
        companyName: row.companyName,
        stageName: row.stageName,
        entries: [entry],
      });
    }
  }

  // Most recently worked deal first; rows arrive chronologically, so the last
  // entry in each group is its latest activity.
  const latest = (group: DailyDealActivity): number =>
    group.entries.at(-1)?.createdAt.getTime() ?? 0;
  return [...byDeal.values()].sort((a, b) => latest(b) - latest(a));
};
