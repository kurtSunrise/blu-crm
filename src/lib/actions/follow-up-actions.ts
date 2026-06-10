"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { followUp } from "@/db/schema";
import { createFollowUpCore } from "@/lib/mutations/follow-up";
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

  // Attribute the write to whoever is signed in; the follow-up's owner is
  // the fallback (public/seeded paths legitimately have no session).
  return await createFollowUpCore({
    ...parsed.data,
    createdBy: (await getSessionUserId()) ?? undefined,
  });
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
