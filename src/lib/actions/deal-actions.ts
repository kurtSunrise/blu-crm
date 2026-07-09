"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  activity,
  contact,
  deal,
  dealStageEvent,
  dealSubStatus,
  pipelineStage,
} from "@/db/schema";
import { runAction } from "@/lib/actions/run-action";
import { dollarsToCents } from "@/lib/format";
import { createLead } from "@/lib/intake";
import { LOST_REASON_LABELS } from "@/lib/labels";
import { updateDealFieldsCore } from "@/lib/mutations/deal";
import { touchDealContact } from "@/lib/mutations/deal-contact";
import { emitNotification, getHandoverRecipientIds } from "@/lib/notifications";
import { requireActionSession } from "@/lib/session";
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

const contactExists = async (contactId: string): Promise<boolean> => {
  const [existingContact] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.id, contactId), isNull(contact.deletedAt)))
    .limit(1);
  return Boolean(existingContact);
};

// Only one box filled (either min or max) is treated as a single value,
// matching the field's pre-range behaviour.
const resolveValueRangeDollars = (
  minDollars: number | undefined,
  maxDollars: number | undefined
): { maxDollars: number | undefined; minDollars: number | undefined } => {
  if (minDollars && maxDollars) {
    return { maxDollars, minDollars };
  }
  return { maxDollars: undefined, minDollars: minDollars ?? maxDollars };
};

export const createQuickAddDeal = async (
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    return createQuickAddDealForUser(formData, auth.session.user.id);
  });

// Body extracted to keep cognitive complexity within the lint budget; the
// runAction callback adds a nesting level that pushed the inline form over.
const createQuickAddDealForUser = async (
  formData: FormData,
  sessionUserId: string
): Promise<ActionState> => {
  const parsed = quickAddDealSchema.safeParse({
    companyName: formData.get("companyName"),
    contactId: formData.get("contactId") || undefined,
    contactName: formData.get("contactName") ?? undefined,
    contactEmail: formData.get("contactEmail") ?? undefined,
    contactPhone: formData.get("contactPhone") ?? undefined,
    projectType: formData.get("projectType") || undefined,
    scopeSummary: formData.get("scopeSummary") ?? undefined,
    estimatedValueDollars: formData.get("estimatedValueDollars") || undefined,
    estimatedValueMaxDollars:
      formData.get("estimatedValueMaxDollars") || undefined,
    fixedDate: formData.get("fixedDate") || undefined,
    ownerId: formData.get("ownerId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const input = parsed.data;

  if (input.contactId && !(await contactExists(input.contactId))) {
    return { error: "Selected contact no longer exists" };
  }

  const { minDollars, maxDollars } = resolveValueRangeDollars(
    input.estimatedValueDollars,
    input.estimatedValueMaxDollars
  );

  const createdDealId = await createLead({
    companyName: input.companyName,
    contactId: input.contactId,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    projectType: input.projectType,
    scopeSummary: input.scopeSummary,
    estimatedValueCents: minDollars ? dollarsToCents(minDollars) : undefined,
    estimatedValueMaxCents: maxDollars ? dollarsToCents(maxDollars) : undefined,
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

interface MoveTargetStage {
  id: string;
  isLost: boolean;
  isWon: boolean;
  name: string;
}

const stageMoveActivityContent = (
  stage: MoveTargetStage,
  lostReason: keyof typeof LOST_REASON_LABELS | undefined,
  handoverToDelivery: boolean | undefined
): string => {
  if (stage.isLost && lostReason) {
    return `Moved to ${stage.name} (reason: ${LOST_REASON_LABELS[lostReason]})`;
  }
  if (stage.isWon && handoverToDelivery) {
    return `Moved to ${stage.name} (handover to delivery flagged)`;
  }
  return `Moved to ${stage.name}`;
};

export const moveDealStage = async (input: unknown): Promise<ActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    return moveDealStageForUser(input, auth.session.user.id);
  });

// Body extracted to keep cognitive complexity within the lint budget; the
// runAction callback adds a nesting level that pushed the inline form over.
const moveDealStageForUser = async (
  input: unknown,
  movedBy: string
): Promise<ActionState> => {
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

  // The current stage (with its name) so the stage-event history records the
  // transition's "from" side, and so a true no-op re-submit writes nothing.
  const [previous] = await db
    .select({
      stageId: deal.stageId,
      stageName: pipelineStage.name,
      lostReason: deal.lostReason,
      handoverToDelivery: deal.handoverToDelivery,
    })
    .from(deal)
    .leftJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(eq(deal.id, dealId))
    .limit(1);

  if (!previous) {
    return { error: "Unknown deal" };
  }

  const isNoOpMove =
    previous.stageId === stageId &&
    (stage.isLost ? previous.lostReason === lostReason : true) &&
    (stage.isWon
      ? previous.handoverToDelivery === (handoverToDelivery ?? false)
      : true);
  if (isNoOpMove) {
    return {};
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

  const content = stageMoveActivityContent(
    stage,
    lostReason,
    handoverToDelivery
  );

  const [stageChangeActivity] = await db
    .insert(activity)
    .values({
      dealId,
      type: "stage_change",
      content,
      createdBy: movedBy,
    })
    .returning({ id: activity.id });

  // Same-stage edits (e.g. changing a lost reason) update the deal above but
  // are not transitions, so only a genuine stage change lands in the history.
  if (previous.stageId !== stageId) {
    await db.insert(dealStageEvent).values({
      dealId,
      fromStageId: previous.stageId,
      fromStageName: previous.stageName,
      toStageId: stage.id,
      toStageName: stage.name,
      activityId: stageChangeActivity?.id,
      source: "move",
      changedBy: movedBy,
    });

    // Moving a deal along the pipeline counts as working it, so it resets the
    // staleness clock and clears any outstanding "needs attention" nudge.
    await touchDealContact(dealId);
  }

  if (stage.isWon && handoverToDelivery) {
    // Won handovers route to the admin-configured recipients (PRD US-10).
    // No actor suppression: the handover is a delivery work item, so the
    // recipient must see it even when they closed the deal themselves.
    await emitNotification({
      type: "handover_to_delivery",
      recipientIds: await getHandoverRecipientIds(),
      payload: { dealId, dealTitle: moved.title, leadId: moved.leadId },
    });
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

export const logQuickActivity = async (input: unknown): Promise<ActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = logActivitySchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid activity" };
    }
    const { dealId, type, content } = parsed.data;

    const now = new Date();
    await db.insert(activity).values({
      dealId,
      type,
      content: content ?? QUICK_LOG_LABELS[type],
      createdBy: auth.session.user.id,
    });
    await touchDealContact(dealId, now);

    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/pipeline");
    revalidatePath("/contacts");
    revalidatePath("/");
    return {};
  });

export const updateDealSharedFolderUrl = async (
  input: unknown
): Promise<ActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = updateSharedFolderSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid link" };
    }
    const { dealId, sharedFolderUrl } = parsed.data;

    const result = await updateDealFieldsCore({
      dealId,
      // An empty submission clears the stored link.
      sharedFolderUrl: sharedFolderUrl === "" ? null : sharedFolderUrl,
      updatedBy: auth.session.user.id,
    });

    if (result.error) {
      return { error: result.error };
    }
    return {};
  });

export const setDealSubStatus = async (input: unknown): Promise<ActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    return setDealSubStatusForUser(input, auth.session.user.id);
  });

// Body extracted to keep cognitive complexity within the lint budget; the
// runAction callback adds a nesting level that pushed the inline form over.
const setDealSubStatusForUser = async (
  input: unknown,
  sessionUserId: string
): Promise<ActionState> => {
  const parsed = setDealSubStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid sub-status" };
  }
  const { dealId, subStatusId, note } = parsed.data;

  const [current] = await db
    .select({
      subStatusId: deal.subStatusId,
      subStatusSetAt: deal.subStatusSetAt,
    })
    .from(deal)
    .where(eq(deal.id, dealId))
    .limit(1);

  if (!current) {
    return { error: "Unknown deal" };
  }

  // Resolve the chosen status for the activity label. An unknown id is always
  // rejected; an archived one is rejected only when it would be a NEW
  // assignment, so editing the note on a deal whose status was later archived
  // still works.
  let label: string | null = null;
  if (subStatusId !== null) {
    const [row] = await db
      .select({
        label: dealSubStatus.label,
        archivedAt: dealSubStatus.archivedAt,
      })
      .from(dealSubStatus)
      .where(eq(dealSubStatus.id, subStatusId))
      .limit(1);
    if (!row) {
      return { error: "Unknown status" };
    }
    if (row.archivedAt && subStatusId !== current.subStatusId) {
      return { error: "That status has been archived" };
    }
    label = row.label;
  }

  // Stamp the clock only when the label itself changes to a new value; a
  // note-only edit keeps the original "on hold since". Clearing wipes it.
  let subStatusSetAt = current.subStatusSetAt;
  if (subStatusId === null) {
    subStatusSetAt = null;
  } else if (subStatusId !== current.subStatusId) {
    subStatusSetAt = new Date();
  }

  await db
    .update(deal)
    .set({
      subStatusId,
      subStatusNote: note ?? null,
      subStatusSetAt,
      updatedAt: new Date(),
    })
    .where(eq(deal.id, dealId));

  const content =
    label === null
      ? "Cleared sub-status"
      : `Marked "${label}"${note ? `: ${note}` : ""}`;

  await db.insert(activity).values({
    dealId,
    type: "note",
    content,
    createdBy: sessionUserId,
  });

  revalidatePath("/pipeline");
  revalidatePath("/reports");
  revalidatePath(`/deals/${dealId}`);
  return {};
};
