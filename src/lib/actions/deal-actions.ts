"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activity, deal, notification, pipelineStage, user } from "@/db/schema";
import { dollarsToCents } from "@/lib/format";
import { createLead } from "@/lib/intake";
import { LOST_REASON_LABELS, SUB_STATUS_LABELS } from "@/lib/labels";
import { updateDealFieldsCore } from "@/lib/mutations/deal";
import { getSessionUserId } from "@/lib/session";
import {
  logActivitySchema,
  moveDealStageSchema,
  quickAddDealSchema,
  setDealSubStatusSchema,
  updateSharedFolderSchema,
} from "@/lib/validation/deal";

export interface ActionState {
  error?: string;
}

export const createQuickAddDeal = async (
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> => {
  const parsed = quickAddDealSchema.safeParse({
    companyName: formData.get("companyName"),
    contactName: formData.get("contactName") ?? undefined,
    contactEmail: formData.get("contactEmail") ?? undefined,
    contactPhone: formData.get("contactPhone") ?? undefined,
    projectType: formData.get("projectType") || undefined,
    scopeSummary: formData.get("scopeSummary") ?? undefined,
    estimatedValueDollars: formData.get("estimatedValueDollars") || undefined,
    fixedDate: formData.get("fixedDate") || undefined,
    ownerId: formData.get("ownerId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const input = parsed.data;
  const sessionUserId = await getSessionUserId();

  const createdDealId = await createLead({
    companyName: input.companyName,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    projectType: input.projectType,
    scopeSummary: input.scopeSummary,
    estimatedValueCents: input.estimatedValueDollars
      ? dollarsToCents(input.estimatedValueDollars)
      : undefined,
    fixedDate: input.fixedDate,
    ownerId: input.ownerId,
    source: "other",
    createdBy: sessionUserId ?? undefined,
  });

  if (!createdDealId) {
    return { error: "Failed to create the deal" };
  }

  revalidatePath("/pipeline");
  redirect("/pipeline");
};

// Won handovers are routed to Kurt, who receives delivery (PRD US-10).
const HANDOVER_RECIPIENT_EMAIL = "kurt@blu.builders";

export const moveDealStage = async (input: unknown): Promise<ActionState> => {
  const parsed = moveDealStageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid stage move" };
  }
  const { dealId, stageId, lostReason, handoverToDelivery } = parsed.data;

  const [stage] = await db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
    })
    .from(pipelineStage)
    .where(eq(pipelineStage.id, stageId))
    .limit(1);

  if (!stage) {
    return { error: "Unknown pipeline stage" };
  }

  // A deal cannot enter Lost / Dormant without a reason (FR-1.6 AC).
  if (stage.isLost && !lostReason) {
    return { error: "A reason is required to mark a deal Lost / Dormant" };
  }

  const [moved] = await db
    .update(deal)
    .set({
      stageId,
      lostReason: stage.isLost ? lostReason : null,
      // Won/Lost entry is the close moment for win-rate and weekly reporting
      // (FR-8.2); reopening a deal clears it.
      closedAt: stage.isWon || stage.isLost ? new Date() : null,
      ...(stage.isWon
        ? { handoverToDelivery: handoverToDelivery ?? false }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(deal.id, dealId))
    .returning({ id: deal.id, title: deal.title, leadId: deal.leadId });

  if (!moved) {
    return { error: "Unknown deal" };
  }

  let content = `Moved to ${stage.name}`;
  if (stage.isLost && lostReason) {
    content = `Moved to ${stage.name} (reason: ${LOST_REASON_LABELS[lostReason]})`;
  } else if (stage.isWon && handoverToDelivery) {
    content = `Moved to ${stage.name} (handover to delivery flagged)`;
  }

  await db.insert(activity).values({
    dealId,
    type: "stage_change",
    content,
    createdBy: await getSessionUserId(),
  });

  if (stage.isWon && handoverToDelivery) {
    const [recipient] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, HANDOVER_RECIPIENT_EMAIL))
      .limit(1);
    if (recipient) {
      await db.insert(notification).values({
        userId: recipient.id,
        type: "handover_to_delivery",
        payload: { dealId, dealTitle: moved.title, leadId: moved.leadId },
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath("/notifications");
  revalidatePath(`/deals/${dealId}`);
  return {};
};

const QUICK_LOG_LABELS: Record<string, string> = {
  call: "Logged a call",
  email: "Logged an email",
  site_visit: "Site visit done",
  meeting: "Meeting held",
  note: "Note",
};

export const logQuickActivity = async (
  input: unknown
): Promise<ActionState> => {
  const parsed = logActivitySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid activity" };
  }
  const { dealId, type, content } = parsed.data;

  const now = new Date();
  await db.insert(activity).values({
    dealId,
    type,
    content: content ?? QUICK_LOG_LABELS[type],
    createdBy: await getSessionUserId(),
  });
  await db
    .update(deal)
    .set({ lastContactAt: now, updatedAt: now })
    .where(eq(deal.id, dealId));

  revalidatePath(`/deals/${dealId}`);
  return {};
};

export const updateDealSharedFolderUrl = async (
  input: unknown
): Promise<ActionState> => {
  const parsed = updateSharedFolderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid link" };
  }
  const { dealId, sharedFolderUrl } = parsed.data;

  const result = await updateDealFieldsCore({
    dealId,
    // An empty submission clears the stored link.
    sharedFolderUrl: sharedFolderUrl === "" ? null : sharedFolderUrl,
    updatedBy: (await getSessionUserId()) ?? undefined,
  });

  if (result.error) {
    return { error: result.error };
  }
  return {};
};

export const setDealSubStatus = async (
  input: unknown
): Promise<ActionState> => {
  const parsed = setDealSubStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid sub-status" };
  }
  const { dealId, subStatus, note } = parsed.data;

  const [current] = await db
    .select({ subStatus: deal.subStatus, subStatusSetAt: deal.subStatusSetAt })
    .from(deal)
    .where(eq(deal.id, dealId))
    .limit(1);

  if (!current) {
    return { error: "Unknown deal" };
  }

  // Stamp the clock only when the label itself changes to a new value; a
  // note-only edit keeps the original "on hold since". Clearing wipes it.
  let subStatusSetAt = current.subStatusSetAt;
  if (subStatus === null) {
    subStatusSetAt = null;
  } else if (subStatus !== current.subStatus) {
    subStatusSetAt = new Date();
  }

  await db
    .update(deal)
    .set({
      subStatus,
      subStatusNote: note ?? null,
      subStatusSetAt,
      updatedAt: new Date(),
    })
    .where(eq(deal.id, dealId));

  const content =
    subStatus === null
      ? "Cleared sub-status"
      : `Marked "${SUB_STATUS_LABELS[subStatus]}"${note ? `: ${note}` : ""}`;

  await db.insert(activity).values({
    dealId,
    type: "note",
    content,
    createdBy: await getSessionUserId(),
  });

  revalidatePath("/pipeline");
  revalidatePath("/reports");
  revalidatePath(`/deals/${dealId}`);
  return {};
};
