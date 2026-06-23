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
import { awstDayKeyRange, type DateKey } from "@/lib/calendar";
import { formatAudFromCents, formatDateAwst, MS_PER_DAY } from "@/lib/format";
import { LOST_REASON_LABELS, type LostReason } from "@/lib/labels";

// A deal's value, mirroring the pipeline board exactly so every surface
// reconciles (FR-1.4 / FR-8.2 AC): an accepted quote wins; otherwise the high
// end of the live options (draft/sent/viewed — declined are off the table);
// otherwise the estimate. Correlated subqueries, so this stays a per-deal
// scalar and never multiplies rows when summed or grouped.
const dealValueCents = sql<number>`coalesce(
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

export const getStageBreakdown = async (): Promise<StageBreakdownRow[]> => {
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
    .leftJoin(
      deal,
      and(eq(deal.stageId, pipelineStage.id), isNull(deal.deletedAt))
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

export const getSubStatusBreakdown = async (): Promise<
  SubStatusBreakdownRow[]
> => {
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
    .where(and(isNull(deal.deletedAt), isNotNull(deal.subStatusId)))
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

export const getWinRate = async (since: Date): Promise<WinRateSummary> => {
  const closed = await db
    .select({
      isWon: pipelineStage.isWon,
      lostReason: deal.lostReason,
      valueCents: dealValueCents,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(and(isNull(deal.deletedAt), gte(deal.closedAt, since)));

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
  since: Date
): Promise<ActivityVolumeRow[]> => {
  const rows = await db
    .select({
      personName: user.name,
      activityCount: count(activity.id),
    })
    .from(activity)
    .leftJoin(user, eq(activity.createdBy, user.id))
    .where(gte(activity.createdAt, since))
    .groupBy(user.name)
    .orderBy(desc(count(activity.id)));

  // Activity logged before per-user attribution lands groups under one row.
  return rows.map((row) => ({
    personName: row.personName ?? "Unattributed",
    activityCount: row.activityCount,
  }));
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
