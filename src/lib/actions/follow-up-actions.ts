"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { followUp } from "@/db/schema";
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
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const input = parsed.data;
  await db.insert(followUp).values({
    dealId: input.dealId,
    action: input.action,
    ownerId: input.ownerId,
    dueDate: input.dueDate,
    createdBy: input.ownerId,
  });

  revalidatePath(`/deals/${input.dealId}`);
  revalidatePath("/tasks");
  return {};
};

export const completeFollowUp = async (
  input: unknown
): Promise<FollowUpActionState> => {
  const parsed = completeFollowUpSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid follow-up" };
  }

  const [updated] = await db
    .update(followUp)
    .set({ completedAt: new Date() })
    .where(eq(followUp.id, parsed.data.followUpId))
    .returning({ dealId: followUp.dealId });

  if (updated) {
    revalidatePath(`/deals/${updated.dealId}`);
  }
  revalidatePath("/tasks");
  return {};
};
