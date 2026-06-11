import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activity, deal } from "@/db/schema";
import { dollarsToCents } from "@/lib/format";
import type { FixedDateType, ProjectType } from "@/lib/labels";

export interface UpdateDealFieldsInput {
  dealId: string;
  decisionMakerConfirmed?: boolean;
  estimatedValueDollars?: number;
  expectedCloseDate?: Date | null;
  fixedDate?: Date | null;
  fixedDateType?: FixedDateType | null;
  notes?: string;
  ownerId?: string;
  projectType?: ProjectType;
  scopeSummary?: string;
  title?: string;
  updatedBy?: string;
  venue?: string;
}

const FIELD_LABELS: Record<string, string> = {
  decisionMakerConfirmed: "decision maker",
  estimatedValueDollars: "estimated value",
  expectedCloseDate: "expected close date",
  fixedDate: "fixed date",
  fixedDateType: "fixed date type",
  notes: "notes",
  ownerId: "owner",
  projectType: "project type",
  scopeSummary: "scope",
  title: "title",
  venue: "venue",
};

// Field-level deal edits shared by the AI update_deal tool (and future edit
// forms). Only the provided fields change; a timeline note records which.
export const updateDealFieldsCore = async (
  input: UpdateDealFieldsInput
): Promise<{ error?: string; changedFields?: string[] }> => {
  const { dealId, updatedBy, ...fields } = input;

  const changes: Partial<typeof deal.$inferInsert> = {};
  if (fields.title !== undefined) {
    changes.title = fields.title;
  }
  if (fields.estimatedValueDollars !== undefined) {
    changes.estimatedValueCents = dollarsToCents(fields.estimatedValueDollars);
  }
  if (fields.venue !== undefined) {
    changes.venue = fields.venue;
  }
  if (fields.scopeSummary !== undefined) {
    changes.scopeSummary = fields.scopeSummary;
  }
  if (fields.projectType !== undefined) {
    changes.projectType = fields.projectType;
  }
  if (fields.fixedDate !== undefined) {
    changes.fixedDate = fields.fixedDate;
  }
  if (fields.fixedDateType !== undefined) {
    changes.fixedDateType = fields.fixedDateType;
  }
  if (fields.expectedCloseDate !== undefined) {
    changes.expectedCloseDate = fields.expectedCloseDate;
  }
  if (fields.decisionMakerConfirmed !== undefined) {
    changes.decisionMakerConfirmed = fields.decisionMakerConfirmed;
  }
  if (fields.ownerId !== undefined) {
    changes.ownerId = fields.ownerId;
  }
  if (fields.notes !== undefined) {
    changes.notes = fields.notes;
  }

  const changedFields = Object.keys(fields).filter(
    (key) => (fields as Record<string, unknown>)[key] !== undefined
  );
  if (changedFields.length === 0) {
    return { error: "No fields to update" };
  }

  const [updated] = await db
    .update(deal)
    .set({ ...changes, updatedAt: new Date(), updatedBy })
    .where(eq(deal.id, dealId))
    .returning({ id: deal.id });

  if (!updated) {
    return { error: "Unknown deal" };
  }

  const labels = changedFields.map((key) => FIELD_LABELS[key] ?? key);
  await db.insert(activity).values({
    content: `Updated ${labels.join(", ")}`,
    createdBy: updatedBy,
    dealId,
    type: "note",
  });

  revalidatePath("/pipeline");
  revalidatePath(`/deals/${dealId}`);
  return { changedFields: labels };
};
