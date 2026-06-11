import { and, eq, ilike, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { company, contact } from "@/db/schema";

export interface UpdateContactFieldsInput {
  companyName?: string;
  contactId: string;
  email?: string;
  name?: string;
  notes?: string;
  phone?: string;
  title?: string;
}

// Partial contact edits for the AI update_contact tool: only the provided
// fields change (the human edit form replaces the whole record instead).
export const updateContactFieldsCore = async (
  input: UpdateContactFieldsInput
): Promise<{ error?: string }> => {
  const [existing] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.id, input.contactId), isNull(contact.deletedAt)))
    .limit(1);
  if (!existing) {
    return { error: "Unknown contact" };
  }

  const changes: Partial<typeof contact.$inferInsert> = {};
  if (input.name !== undefined) {
    changes.name = input.name;
  }
  if (input.email !== undefined) {
    changes.email = input.email;
  }
  if (input.phone !== undefined) {
    changes.phone = input.phone;
  }
  if (input.title !== undefined) {
    changes.title = input.title;
  }
  if (input.notes !== undefined) {
    changes.notes = input.notes;
  }
  if (input.companyName !== undefined) {
    const [existingCompany] = await db
      .select({ id: company.id })
      .from(company)
      .where(
        and(ilike(company.name, input.companyName), isNull(company.deletedAt))
      )
      .limit(1);
    if (existingCompany) {
      changes.companyId = existingCompany.id;
    } else {
      const [created] = await db
        .insert(company)
        .values({ name: input.companyName })
        .returning({ id: company.id });
      changes.companyId = created?.id;
    }
  }

  if (Object.keys(changes).length === 0) {
    return { error: "No fields to update" };
  }

  await db
    .update(contact)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(contact.id, input.contactId));

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${input.contactId}`);
  return {};
};
