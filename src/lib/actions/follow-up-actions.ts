"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activity, followUp } from "@/db/schema";
import { runAction } from "@/lib/actions/run-action";
import { touchDealContact } from "@/lib/mutations/deal-contact";
import { createFollowUpCore } from "@/lib/mutations/follow-up";
import { requireActionSession } from "@/lib/session";
import {
  completeFollowUpSchema,
  createFollowUpSchema,
} from "@/lib/validation/follow-up";

export interface FollowUpActionState {
  error?: string;
  // Set on a successful create so the form can toast and refresh; a bare {}
  // (the initial state) is indistinguishable from success otherwise.
  ok?: boolean;
}

export const createFollowUp = async (
  _prevState: FollowUpActionState,
  formData: FormData
): Promise<FollowUpActionState> =>
  runAction<FollowUpActionState>(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
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
    const result = await createFollowUpCore({
      ...parsed.data,
      createdBy: auth.session.user.id,
    });
    return result.error ? result : { ok: true };
  });

export const completeFollowUp = async (
  input: unknown
): Promise<FollowUpActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = completeFollowUpSchema.safeParse(input);
    if (!parsed.success) {
      return { error: "Invalid follow-up" };
    }

    const [completed] = await db
      .update(followUp)
      .set({ completedAt: new Date() })
      .where(eq(followUp.id, parsed.data.followUpId))
      .returning({ dealId: followUp.dealId, action: followUp.action });

    if (!completed) {
      return { error: "Unknown follow-up" };
    }

    // Leave a trace on the deal timeline so a completed follow-up isn't just
    // silently dropped from the open list. No session on the AI path → null
    // author, consistent with how stage changes are attributed.
    await db.insert(activity).values({
      dealId: completed.dealId,
      type: "follow_up",
      content: completed.action,
      createdBy: auth.session.user.id,
    });

    // Working a follow-up to completion counts as engaging the deal, so it
    // resets the staleness clock and clears any outstanding stale nudge.
    await touchDealContact(completed.dealId);

    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath(`/deals/${completed.dealId}`);
    return {};
  });
