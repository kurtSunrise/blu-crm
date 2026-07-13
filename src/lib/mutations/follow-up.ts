import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { followUp } from "@/db/schema";
import { getAutoFollowUpConfig } from "@/lib/alerts";
import { MS_PER_DAY } from "@/lib/format";
import type { CreateFollowUpInput } from "@/lib/validation/follow-up";

// Shared core used by both the follow-up form action and the AI
// create_follow_up tool, so there is exactly one write path (PRD §9.3).
// createdBy attributes the write (session user / confirming user); the
// follow-up's owner is the fallback.
export const createFollowUpCore = async (
  input: CreateFollowUpInput & { createdBy?: string }
): Promise<{ error?: string }> => {
  await db.insert(followUp).values({
    action: input.action,
    createdBy: input.createdBy ?? input.ownerId,
    dealId: input.dealId,
    dueDate: input.dueDate,
    ownerId: input.ownerId,
  });

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/deals/${input.dealId}`);
  return {};
};

// Stage-entry automation (Settings → Alerts & automations): when a deal moves
// into the admin-chosen stage and has no open follow-up, a chase follow-up is
// created for the deal owner (falling back to whoever moved it). Runs after
// the stage write has committed, so it never blocks or rolls back a move; a
// failure only costs the automated reminder, which the caller logs.
export const maybeCreateStageEntryFollowUp = async (params: {
  dealId: string;
  movedBy: string;
  ownerId: string | null;
  stageName: string;
  toStageId: string;
}): Promise<void> => {
  const config = await getAutoFollowUpConfig();
  if (!config.stageId || config.stageId !== params.toStageId) {
    return;
  }

  const [open] = await db
    .select({ id: followUp.id })
    .from(followUp)
    .where(
      and(eq(followUp.dealId, params.dealId), isNull(followUp.completedAt))
    )
    .limit(1);
  if (open) {
    return;
  }

  await createFollowUpCore({
    action: `Follow up after moving to ${params.stageName}`,
    createdBy: params.movedBy,
    dealId: params.dealId,
    dueDate: new Date(Date.now() + config.days * MS_PER_DAY),
    ownerId: params.ownerId ?? params.movedBy,
  });
};
