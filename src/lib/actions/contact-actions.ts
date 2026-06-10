"use server";

import { and, ilike, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { company, contact } from "@/db/schema";
import {
  type DuplicateCandidate,
  findDuplicateContacts,
} from "@/lib/duplicates";
import { getSessionUserId } from "@/lib/session";
import { createContactSchema } from "@/lib/validation/contact";

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
});

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

  const sessionUserId = await getSessionUserId();
  const [created] = await db
    .insert(contact)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      title: input.title,
      companyId,
      createdBy: sessionUserId,
      updatedBy: sessionUserId,
    })
    .returning({ id: contact.id });

  if (!created) {
    return { error: "Failed to create the contact", values };
  }

  revalidatePath("/contacts");
  redirect(`/contacts/${created.id}`);
};
