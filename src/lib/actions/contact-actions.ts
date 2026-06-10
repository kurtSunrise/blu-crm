"use server";

import { and, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { company, contact } from "@/db/schema";
import { createContactSchema } from "@/lib/validation/contact";

export interface DuplicateCandidate {
  email: string | null;
  exact: boolean;
  id: string;
  name: string;
  phone: string | null;
}

export interface ContactActionState {
  duplicates?: DuplicateCandidate[];
  error?: string;
}

// FR-2.3: exact email/phone matches always warn; fuzzy name matches warn
// with the candidate shown; the user can proceed deliberately.
const findDuplicates = async (input: {
  name: string;
  email?: string;
  phone?: string;
}): Promise<DuplicateCandidate[]> => {
  const exactConditions: SQL[] = [];
  if (input.email) {
    exactConditions.push(ilike(contact.email, input.email));
  }
  if (input.phone) {
    exactConditions.push(eq(contact.phone, input.phone));
  }

  const candidates = new Map<string, DuplicateCandidate>();

  if (exactConditions.length > 0) {
    const exactMatches = await db
      .select({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
      })
      .from(contact)
      .where(and(or(...exactConditions), isNull(contact.deletedAt)));
    for (const match of exactMatches) {
      candidates.set(match.id, { ...match, exact: true });
    }
  }

  const nameMatches = await db
    .select({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
    })
    .from(contact)
    .where(and(ilike(contact.name, input.name), isNull(contact.deletedAt)));
  for (const match of nameMatches) {
    if (!candidates.has(match.id)) {
      candidates.set(match.id, { ...match, exact: false });
    }
  }

  return [...candidates.values()];
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

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const input = parsed.data;

  if (!input.allowDuplicate) {
    const duplicates = await findDuplicates(input);
    if (duplicates.length > 0) {
      return { duplicates };
    }
  }

  let companyId: string | undefined;
  if (input.companyName) {
    const [existing] = await db
      .select({ id: company.id })
      .from(company)
      .where(
        and(ilike(company.name, input.companyName), isNull(company.deletedAt))
      )
      .limit(1);
    if (existing) {
      companyId = existing.id;
    } else {
      const [created] = await db
        .insert(company)
        .values({ name: input.companyName })
        .returning({ id: company.id });
      companyId = created?.id;
    }
  }

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
    return { error: "Failed to create the contact" };
  }

  revalidatePath("/contacts");
  redirect(`/contacts/${created.id}`);
};
