import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { deal, followUp, notification } from "@/db/schema";

// There is no background scheduler on Workers in V1, so overdue follow-up
// notifications (FR-11.1) are generated lazily when a notification surface
// loads. Idempotent: one notification per follow-up, keyed via the payload.
export const sweepOverdueFollowUpNotifications = async (): Promise<void> => {
  const overdue = await db
    .select({
      id: followUp.id,
      action: followUp.action,
      ownerId: followUp.ownerId,
      dueDate: followUp.dueDate,
      dealId: followUp.dealId,
      dealTitle: deal.title,
      leadId: deal.leadId,
    })
    .from(followUp)
    .innerJoin(deal, eq(followUp.dealId, deal.id))
    .leftJoin(
      notification,
      and(
        eq(notification.type, "follow_up_overdue"),
        eq(sql`${notification.payload}->>'followUpId'`, followUp.id)
      )
    )
    .where(
      and(
        isNull(followUp.completedAt),
        lt(followUp.dueDate, new Date()),
        isNull(notification.id)
      )
    );

  if (overdue.length === 0) {
    return;
  }

  await db.insert(notification).values(
    overdue.map((item) => ({
      userId: item.ownerId,
      type: "follow_up_overdue",
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
};
