"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { followUp } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import {
  completeFollowUpSchema,
  createFollowUpSchema,
} from "@/lib/validation/follow-up";

export interface FollowUpActionState {
  error?: string;
}

export const createFollowUp = async (
  _prevState: FollowUpActionState,
  formData: FormData
): Promise<FollowUpActionState> => {
  const parsed = createFollowUpSchema.safeParse({
    dealId: formData.get("dealId"),
    action: formData.get("action"),
    ownerId: formData.get("ownerId"),
    dueDate: formData.get("dueDate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid follow-up" };
  }

  const { dealId, action, ownerId, dueDate } = parsed.data;

  await db.insert(followUp).values({
    dealId,
    action,
    ownerId,
    dueDate,
    createdBy: (await getSessionUserId()) ?? ownerId,
  });

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/deals/${dealId}`);
  return {};
};

export const completeFollowUp = async (
  input: unknown
): Promise<FollowUpActionState> => {
  const parsed = completeFollowUpSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid follow-up" };
  }

  const [completed] = await db
    .update(followUp)
    .set({ completedAt: new Date() })
    .where(eq(followUp.id, parsed.data.followUpId))
    .returning({ dealId: followUp.dealId });

  if (!completed) {
    return { error: "Unknown follow-up" };
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath(`/deals/${completed.dealId}`);
  return {};
};
