import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activity, company, contact, deal, pipelineStage } from "@/db/schema";
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/lib/labels";
import { nextLeadId } from "@/lib/lead-id";

// The single lead write path shared by every intake channel: manual
// quick-add, the public web enquiry form, email-to-lead, and (later) the AI
// tools (PRD §10 architecture note).

export const findOrCreateCompany = async (
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

export const findOrCreateContact = async (input: {
  name?: string;
  email?: string;
  phone?: string;
  companyId?: string;
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

  if (!(name || email || phone)) {
    return null;
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

// Lead IDs can race with concurrent intakes, so retry on collisions.
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

export interface CreateLeadInput {
  companyName?: string;
  contactEmail?: string;
  contactName?: string;
  contactPhone?: string;
  estimatedValueCents?: number;
  fixedDate?: Date;
  ownerId?: string;
  // The signed-in user who performed the capture; falls back to the owner.
  createdBy?: string;
  projectType?: ProjectType;
  // Raw enquiry text (e.g. a forwarded email body) attached to the timeline
  // so no enquiry is ever silently dropped (FR-3.3 AC).
  rawNote?: string;
  scopeSummary?: string;
  source: "web" | "instagram" | "referral" | "repeat_client" | "other";
  // Lands in the first stage (Lead Captured) unless explicitly placed,
  // e.g. by CSV import of an existing open pipeline (FR-3.4).
  stageId?: string;
  title?: string;
}

export const createLead = async (
  input: CreateLeadInput
): Promise<string | null> => {
  const [firstStage] = await db
    .select({ id: pipelineStage.id })
    .from(pipelineStage)
    .orderBy(pipelineStage.position)
    .limit(1);

  if (!firstStage) {
    throw new Error("Pipeline stages are not seeded. Run npm run db:seed.");
  }

  const companyId = input.companyName
    ? await findOrCreateCompany(input.companyName, input.ownerId)
    : undefined;
  const contactId = await findOrCreateContact({
    name: input.contactName,
    email: input.contactEmail,
    phone: input.contactPhone,
    companyId,
    ownerId: input.ownerId,
  });

  const namePart =
    input.companyName ?? input.contactName ?? input.contactEmail ?? "Enquiry";
  const projectTypeLabel = input.projectType
    ? PROJECT_TYPE_LABELS[input.projectType]
    : undefined;
  const title =
    input.title ??
    (projectTypeLabel ? `${namePart} - ${projectTypeLabel}` : namePart);

  const dealId = await insertDealWithLeadId({
    title,
    estimatedValueCents: input.estimatedValueCents,
    stageId: input.stageId ?? firstStage.id,
    ownerId: input.ownerId,
    companyId,
    contactId: contactId ?? undefined,
    projectType: input.projectType,
    scopeSummary: input.scopeSummary,
    fixedDate: input.fixedDate,
    source: input.source,
    createdBy: input.createdBy ?? input.ownerId,
    updatedBy: input.createdBy ?? input.ownerId,
  });

  if (dealId && input.rawNote) {
    await db.insert(activity).values({
      dealId,
      type: "note",
      content: input.rawNote,
    });
  }

  return dealId;
};
