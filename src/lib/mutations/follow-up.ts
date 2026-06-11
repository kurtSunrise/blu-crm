import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { followUp } from "@/db/schema";
import type { CreateFollowUpInput } from "@/lib/validation/follow-up";

// Shared core used by both the follow-up form action and the AI
// create_follow_up tool, so there is exactly one write path (PRD §9.3).
export const createFollowUpCore = async (
  input: CreateFollowUpInput
): Promise<{ error?: string }> => {
  await db.insert(followUp).values({
    action: input.action,
    createdBy: input.ownerId,
    dealId: input.dealId,
    dueDate: input.dueDate,
    ownerId: input.ownerId,
  });

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/deals/${input.dealId}`);
  return {};
};
