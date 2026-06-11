"use server";

import { and, eq, ilike, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { company, contact } from "@/db/schema";
import {
  type DuplicateCandidate,
  findDuplicateContacts,
} from "@/lib/duplicates";
import {
  createContactSchema,
  updateContactSchema,
} from "@/lib/validation/contact";

export interface ContactActionState {
  duplicates?: DuplicateCandidate[];
  error?: string;
  // Submitted values echoed back so the (uncontrolled) form can restore
  // them after React resets the fields post-action.
  values?: {
    name: string;
    email: string;
    phone: string;
    title: string;
    companyName: string;
    notes?: string;
  };
}

const submittedValues = (
  formData: FormData
): NonNullable<ContactActionState["values"]> => ({
  name: String(formData.get("name") ?? ""),
  email: String(formData.get("email") ?? ""),
  phone: String(formData.get("phone") ?? ""),
  title: String(formData.get("title") ?? ""),
  companyName: String(formData.get("companyName") ?? ""),
  notes: String(formData.get("notes") ?? ""),
});

// Companies are matched case-insensitively by name so a contact edit or
// create never spawns "Acme" next to "acme".
const findOrCreateCompany = async (
  companyName: string
): Promise<string | undefined> => {
  const [existing] = await db
    .select({ id: company.id })
    .from(company)
    .where(and(ilike(company.name, companyName), isNull(company.deletedAt)))
    .limit(1);
  if (existing) {
    return existing.id;
  }
  const [created] = await db
    .insert(company)
    .values({ name: companyName })
    .returning({ id: company.id });
  return created?.id;
};

export const createContact = async (
  _prevState: ContactActionState,
  formData: FormData
): Promise<ContactActionState> => {
  const parsed = createContactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    title: formData.get("title") ?? undefined,
    companyName: formData.get("companyName") ?? undefined,
    allowDuplicate: formData.get("allowDuplicate") === "true",
  });

  const values = submittedValues(formData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      values,
    };
  }

  const input = parsed.data;

  if (!input.allowDuplicate) {
    const duplicates = await findDuplicateContacts(input);
    if (duplicates.length > 0) {
      return { duplicates, values };
    }
  }

  const companyId = input.companyName
    ? await findOrCreateCompany(input.companyName)
    : undefined;

  const [created] = await db
    .insert(contact)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      title: input.title,
      companyId,
    })
    .returning({ id: contact.id });

  if (!created) {
    return { error: "Failed to create the contact", values };
  }

  revalidatePath("/contacts");
  redirect(`/contacts/${created.id}`);
};

export const updateContact = async (
  _prevState: ContactActionState,
  formData: FormData
): Promise<ContactActionState> => {
  const contactId = formData.get("contactId");
  const values = submittedValues(formData);
  if (typeof contactId !== "string") {
    return { error: "This contact no longer exists", values };
  }

  const parsed = updateContactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    title: formData.get("title") ?? undefined,
    companyName: formData.get("companyName") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      values,
    };
  }

  const [existing] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.id, contactId), isNull(contact.deletedAt)))
    .limit(1);
  if (!existing) {
    return { error: "This contact no longer exists", values };
  }

  const input = parsed.data;
  // An emptied company field detaches the contact rather than keeping a
  // stale link.
  const companyId = input.companyName
    ? await findOrCreateCompany(input.companyName)
    : null;

  await db
    .update(contact)
    .set({
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      title: input.title ?? null,
      notes: input.notes ?? null,
      companyId: companyId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(contact.id, contactId));

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}`);
};

// Soft delete per PRD §7: the contact leaves lists and search, but their
// deals, quotes, and timeline history stay intact.
export const archiveContact = async (contactId: string): Promise<void> => {
  await db
    .update(contact)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contact.id, contactId), isNull(contact.deletedAt)));

  revalidatePath("/contacts");
  redirect("/contacts");
};
