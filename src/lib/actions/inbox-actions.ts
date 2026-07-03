"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activity, deal, user } from "@/db/schema";
import { emitNotification } from "@/lib/notifications";
import { getSessionUserId } from "@/lib/session";

export interface InboxActionState {
  error?: string;
}

const assignSchema = z.object({
  dealId: z.string().min(1),
  ownerId: z.string().min(1),
});

const discardSchema = z.object({
  dealId: z.string().min(1),
});

const revalidateInboxViews = (dealId: string): void => {
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/notifications");
  revalidatePath(`/deals/${dealId}`);
};

export const assignDealOwner = async (
  input: unknown
): Promise<InboxActionState> => {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid assignment" };
  }
  const { dealId, ownerId } = parsed.data;

  const [assignee] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1);
  if (!assignee) {
    return { error: "Unknown owner" };
  }

  const [assigned] = await db
    .update(deal)
    .set({ ownerId, updatedBy: ownerId, updatedAt: new Date() })
    .where(eq(deal.id, dealId))
    .returning({ id: deal.id, title: deal.title, leadId: deal.leadId });

  if (!assigned) {
    return { error: "Unknown deal" };
  }

  const assignedBy = await getSessionUserId();
  await db.insert(activity).values({
    dealId,
    type: "note",
    content: `Lead assigned to ${assignee.name}`,
    createdBy: assignedBy,
  });

  // New-lead-assigned notification (FR-11.1). Self-assignments are skipped.
  await emitNotification({
    type: "lead_assigned",
    recipientIds: [ownerId],
    actorId: assignedBy,
    payload: { dealId, dealTitle: assigned.title, leadId: assigned.leadId },
  });

  revalidateInboxViews(dealId);
  return {};
};

// Discard is a soft delete (PRD §7: no hard deletes in V1).
export const discardLead = async (
  input: unknown
): Promise<InboxActionState> => {
  const parsed = discardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid lead" };
  }

  const [discarded] = await db
    .update(deal)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(deal.id, parsed.data.dealId))
    .returning({ id: deal.id });

  if (!discarded) {
    return { error: "Unknown deal" };
  }

  revalidateInboxViews(parsed.data.dealId);
  return {};
};
