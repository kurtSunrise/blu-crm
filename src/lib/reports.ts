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
import type { TimelineEntry } from "@/components/deal-timeline";
import { db } from "@/db";
import {
  activity,
  company,
  deal,
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

  const thresholds = await getAlertThresholds();
  const breakdown = await getStageBreakdown();
  const needsAttention = await getStaleDeals(thresholds.staleDays);
  const closingSoon = await getClosingSoonDeals(thresholds.closingSoonDays);

  const [newThisWeek] = await db
    .select({ value: count(deal.id) })
    .from(deal)
    .where(and(isNull(deal.deletedAt), gte(deal.createdAt, weekStart)));

  const openDeals = await db
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
    .orderBy(asc(pipelineStage.position), desc(dealValueCents));

  const closedThisWeek = await db
    .select({ ...reportDealColumns, isWon: pipelineStage.isWon })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .where(and(isNull(deal.deletedAt), gte(deal.closedAt, weekStart)))
    .orderBy(desc(dealValueCents));

  const actions = await db
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
    .orderBy(asc(followUp.dueDate));

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
