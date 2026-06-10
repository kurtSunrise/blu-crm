import { and, asc, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { activity, deal, followUp, pipelineStage, user } from "@/db/schema";
import { awstDayRange, MS_PER_DAY } from "@/lib/format";

// Reporting reads (FR-8.1 dashboard, FR-8.2 weekly snapshot). The dashboard
// and the weekly report share these helpers so their numbers reconcile by
// construction (FR-8.2 AC).

const PERCENT = 100;

// The Monday-to-Monday week the team runs on, in Perth time.
export const awstWeekRange = (
  now: Date = new Date()
): { start: Date; end: Date } => {
  const { start: todayStart } = awstDayRange(now);
  // Day of week for the AWST day containing `now`: 0 = Sunday.
  const dayOfWeek = new Date(todayStart.getTime() + 8 * 3_600_000).getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const start = new Date(todayStart.getTime() - daysSinceMonday * MS_PER_DAY);
  return { start, end: new Date(start.getTime() + 7 * MS_PER_DAY) };
};

export interface StageReportRow {
  dealCount: number;
  id: string;
  isLost: boolean;
  isWon: boolean;
  name: string;
  position: number;
  totalCents: number;
  weightedCents: number;
  weighting: number;
}

// Quoted value wins over the estimate everywhere (FR-1.4 AC).
const dealValue = sql<number>`coalesce(sum(coalesce(${deal.quotedValueCents}, ${deal.estimatedValueCents}, 0)), 0)`;

export const getPipelineByStage = async (): Promise<StageReportRow[]> => {
  const rows = await db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      position: pipelineStage.position,
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
      weighting: pipelineStage.weighting,
      dealCount: count(deal.id),
      totalCents: dealValue,
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
    // Weighted pipeline value = value x stage probability (FR-8.1); Won and
    // Lost stages carry no forecast weight.
    weightedCents:
      row.isWon || row.isLost
        ? 0
        : Math.round((Number(row.totalCents) * row.weighting) / PERCENT),
  }));
};

export interface ClosedDeal {
  closedAt: Date;
  handoverToDelivery: boolean;
  id: string;
  leadId: string;
  lostReason: string | null;
  title: string;
  valueCents: number;
}

// "Closed in period" approximates close time with the deal's last update;
// deals rarely change after entering Won or Lost / Dormant. A dedicated
// stage_changed_at lands with the AI reporting work if precision matters.
const closedDeals = async (
  flag: "won" | "lost",
  since: Date,
  until: Date
): Promise<ClosedDeal[]> => {
  const stageFlag = flag === "won" ? pipelineStage.isWon : pipelineStage.isLost;
  const rows = await db
    .select({
      id: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      valueCents: sql<number>`coalesce(${deal.quotedValueCents}, ${deal.estimatedValueCents}, 0)`,
      handoverToDelivery: deal.handoverToDelivery,
      lostReason: deal.lostReason,
      closedAt: deal.updatedAt,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(
      and(
        isNull(deal.deletedAt),
        eq(stageFlag, true),
        gte(deal.updatedAt, since),
        lt(deal.updatedAt, until)
      )
    )
    .orderBy(asc(deal.updatedAt));
  return rows.map((row) => ({ ...row, valueCents: Number(row.valueCents) }));
};

export interface WinRateReport {
  lost: ClosedDeal[];
  lostReasonCounts: { reason: string; count: number }[];
  winRatePercent: number | null;
  won: ClosedDeal[];
}

export const getWinRate = async (
  since: Date,
  until: Date = new Date()
): Promise<WinRateReport> => {
  const won = await closedDeals("won", since, until);
  const lost = await closedDeals("lost", since, until);
  const closedCount = won.length + lost.length;

  const reasonCounts = new Map<string, number>();
  for (const item of lost) {
    const reason = item.lostReason ?? "unrecorded";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  return {
    won,
    lost,
    winRatePercent:
      closedCount === 0
        ? null
        : Math.round((won.length / closedCount) * PERCENT),
    lostReasonCounts: [...reasonCounts.entries()]
      .map(([reason, total]) => ({ reason, count: total }))
      .sort((a, b) => b.count - a.count),
  };
};

export interface ActivityVolumeRow {
  count: number;
  label: string;
}

export const getActivityVolume = async (
  since: Date
): Promise<{ byType: ActivityVolumeRow[]; byPerson: ActivityVolumeRow[] }> => {
  const byType = await db
    .select({ label: activity.type, count: count(activity.id) })
    .from(activity)
    .where(gte(activity.createdAt, since))
    .groupBy(activity.type)
    .orderBy(sql`count(${activity.id}) desc`);

  // Attribution depends on sessions; unattributed history groups together.
  const byPerson = await db
    .select({
      label: sql<string>`coalesce(${user.name}, 'Unattributed')`,
      count: count(activity.id),
    })
    .from(activity)
    .leftJoin(user, eq(activity.createdBy, user.id))
    .where(gte(activity.createdAt, since))
    .groupBy(sql`coalesce(${user.name}, 'Unattributed')`)
    .orderBy(sql`count(${activity.id}) desc`);

  return {
    byType: byType.map((row) => ({ ...row, count: Number(row.count) })),
    byPerson: byPerson.map((row) => ({ ...row, count: Number(row.count) })),
  };
};

export const getNewLeadCount = async (
  since: Date,
  until: Date
): Promise<number> => {
  const [row] = await db
    .select({ value: count(deal.id) })
    .from(deal)
    .where(
      and(
        isNull(deal.deletedAt),
        gte(deal.createdAt, since),
        lt(deal.createdAt, until)
      )
    );
  return row?.value ?? 0;
};

export interface WeeklyAction {
  action: string;
  dealId: string;
  dealTitle: string;
  dueDate: Date;
  id: string;
  ownerName: string | null;
}

// Open follow-ups due before the end of the week, overdue included.
export const getActionsForWeek = async (
  weekEnd: Date
): Promise<WeeklyAction[]> =>
  await db
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
        lt(followUp.dueDate, weekEnd)
      )
    )
    .orderBy(asc(followUp.dueDate));
