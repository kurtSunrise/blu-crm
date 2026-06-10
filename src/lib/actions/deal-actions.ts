"use server";

import { and, eq, ilike, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  activity,
  company,
  contact,
  deal,
  notification,
  pipelineStage,
  user,
} from "@/db/schema";
import { dollarsToCents } from "@/lib/format";
import { LOST_REASON_LABELS } from "@/lib/labels";
import { nextLeadId } from "@/lib/lead-id";
import {
  logActivitySchema,
  moveDealStageSchema,
  quickAddDealSchema,
} from "@/lib/validation/deal";

export interface ActionState {
  error?: string;
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  fit_out: "Fit-out",
  retail_display: "Retail display",
  event_stand: "Event stand",
  exhibition: "Exhibition",
  install: "Install",
  themed_build: "Themed build",
  other: "Other",
};

const findOrCreateCompany = async (
  name: string,
  ownerId: string | undefined
): Promise<string> => {
  const [existing] = await db
    .select({ id: company.id })
    .from(company)
    .where(and(ilike(company.name, name), isNull(company.deletedAt)))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(company)
    .values({ name, createdBy: ownerId, updatedBy: ownerId })
    .returning({ id: company.id });

  if (!created) {
    throw new Error("Failed to create company");
  }
  return created.id;
};

const findOrCreateContact = async (input: {
  name?: string;
  email?: string;
  phone?: string;
  companyId: string;
  ownerId?: string;
}): Promise<string | null> => {
  const { name, email, phone, companyId, ownerId } = input;

  if (email) {
    const [byEmail] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(ilike(contact.email, email), isNull(contact.deletedAt)))
      .limit(1);
    if (byEmail) {
      return byEmail.id;
    }
  }

  if (phone) {
    const [byPhone] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.phone, phone), isNull(contact.deletedAt)))
      .limit(1);
    if (byPhone) {
      return byPhone.id;
    }
  }

  const [created] = await db
    .insert(contact)
    .values({
      name: name ?? email ?? phone ?? "Unknown contact",
      email,
      phone,
      companyId,
      createdBy: ownerId,
      updatedBy: ownerId,
    })
    .returning({ id: contact.id });

  return created?.id ?? null;
};

// Drizzle wraps the Postgres error, so the "duplicate key" message lives on
// the error's cause chain rather than the top-level message.
const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current.message.includes("duplicate key")) {
      return true;
    }
    current = current.cause;
  }
  return false;
};

const LEAD_ID_INSERT_ATTEMPTS = 3;

type NewDealValues = Omit<typeof deal.$inferInsert, "leadId">;

// Lead IDs can race with concurrent quick-adds, so retry on collisions.
const insertDealWithLeadId = async (
  values: NewDealValues
): Promise<string | null> => {
  for (let attempt = 1; attempt <= LEAD_ID_INSERT_ATTEMPTS; attempt += 1) {
    try {
      const [created] = await db
        .insert(deal)
        .values({ ...values, leadId: await nextLeadId() })
        .returning({ id: deal.id });
      return created?.id ?? null;
    } catch (error) {
      const canRetry =
        isUniqueViolation(error) && attempt < LEAD_ID_INSERT_ATTEMPTS;
      if (!canRetry) {
        throw error;
      }
    }
  }
  return null;
};

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

  const [firstStage] = await db
    .select({ id: pipelineStage.id })
    .from(pipelineStage)
    .orderBy(pipelineStage.position)
    .limit(1);

  if (!firstStage) {
    return { error: "Pipeline stages are not seeded. Run npm run db:seed." };
  }

  const companyId = await findOrCreateCompany(input.companyName, input.ownerId);
  const contactId = await findOrCreateContact({
    name: input.contactName,
    email: input.contactEmail,
    phone: input.contactPhone,
    companyId,
    ownerId: input.ownerId,
  });

  const projectTypeLabel = input.projectType
    ? PROJECT_TYPE_LABELS[input.projectType]
    : undefined;
  const title = projectTypeLabel
    ? `${input.companyName} - ${projectTypeLabel}`
    : input.companyName;

  const values: NewDealValues = {
    title,
    estimatedValueCents: input.estimatedValueDollars
      ? dollarsToCents(input.estimatedValueDollars)
      : undefined,
    stageId: firstStage.id,
    ownerId: input.ownerId,
    companyId,
    contactId,
    projectType: input.projectType,
    scopeSummary: input.scopeSummary,
    fixedDate: input.fixedDate,
    createdBy: input.ownerId,
    updatedBy: input.ownerId,
  };

  const createdDealId = await insertDealWithLeadId(values);

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
  });
  await db
    .update(deal)
    .set({ lastContactAt: now, updatedAt: now })
    .where(eq(deal.id, dealId));

  revalidatePath(`/deals/${dealId}`);
  return {};
};
