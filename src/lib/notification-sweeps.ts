import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { deal, followUp } from "@/db/schema";
import { getAlertThresholds, getStaleDeals } from "@/lib/alerts";
import { awstDayRange } from "@/lib/format";
import { emitNotificationBatch } from "@/lib/notifications";

// Sweep-generated notifications (FR-11.1). Every sweep is idempotent: each
// candidate carries a subject-scoped dedupe key, and the unique index on
// notification.dedupe_key turns repeats into no-ops. Safe to run from the
// cron, a manual trigger, or both concurrently.

interface FollowUpCandidate {
  action: string;
  dealId: string;
  dealTitle: string;
  dueDate: Date;
  id: string;
  leadId: string;
  ownerId: string;
}

const followUpColumns = {
  id: followUp.id,
  action: followUp.action,
  ownerId: followUp.ownerId,
  dueDate: followUp.dueDate,
  dealId: followUp.dealId,
  dealTitle: deal.title,
  leadId: deal.leadId,
};

const emitFollowUpNotifications = async (
  type: "follow_up_due" | "follow_up_overdue",
  candidates: FollowUpCandidate[]
): Promise<number> =>
  await emitNotificationBatch(
    type,
    candidates.map((item) => ({
      recipientId: item.ownerId,
      dedupeKey: `${type}:${item.id}`,
      payload: {
        followUpId: item.id,
        dealId: item.dealId,
        dealTitle: item.dealTitle,
        leadId: item.leadId,
        action: item.action,
        dueDate: item.dueDate.toISOString(),
      },
    }))
  );

// Incomplete follow-ups past their due date. A reassigned overdue follow-up
// notifies the new owner once (the dedupe key includes the recipient).
export const sweepOverdueFollowUpNotifications = async (): Promise<number> => {
  const overdue = await db
    .select(followUpColumns)
    .from(followUp)
    .innerJoin(deal, eq(followUp.dealId, deal.id))
    .where(and(isNull(followUp.completedAt), lt(followUp.dueDate, new Date())));

  return await emitFollowUpNotifications("follow_up_overdue", overdue);
};

// Morning heads-up: incomplete follow-ups due within the current AWST day.
export const sweepFollowUpDueToday = async (): Promise<number> => {
  const { start, end } = awstDayRange();
  const dueToday = await db
    .select(followUpColumns)
    .from(followUp)
    .innerJoin(deal, eq(followUp.dealId, deal.id))
    .where(
      and(
        isNull(followUp.completedAt),
        gte(followUp.dueDate, start),
        lt(followUp.dueDate, end)
      )
    );

  return await emitFollowUpNotifications("follow_up_due", dueToday);
};

// Stale-deal nudges (PRD FR-11.1 P0). Reuses the dashboard's stale query so
// the threshold semantics can never drift. The dedupe key anchors on the
// staleness episode (coalesce(lastContactAt, createdAt)): a deal nudges once,
// then again only after fresh contact goes stale again.
export const sweepStaleDealNudges = async (): Promise<number> => {
  const { staleDays } = await getAlertThresholds();
  const staleDeals = await getStaleDeals(staleDays);

  const entries = staleDeals.flatMap((item) => {
    if (!item.ownerId) {
      return [];
    }
    const anchor = (item.lastContactAt ?? item.createdAt).toISOString();
    return [
      {
        recipientId: item.ownerId,
        dedupeKey: `stale_deal:${item.id}:${anchor}`,
        payload: {
          dealId: item.id,
          dealTitle: item.title,
          leadId: item.leadId,
          lastContactAt: anchor,
        },
      },
    ];
  });

  return await emitNotificationBatch("stale_deal", entries);
};
