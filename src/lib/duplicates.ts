import { and, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { contact } from "@/db/schema";

export interface DuplicateCandidate {
  email: string | null;
  exact: boolean;
  id: string;
  name: string;
  phone: string | null;
}

// FR-2.3: exact email/phone matches always warn; fuzzy name matches warn
// with the candidate shown; the user can proceed deliberately. Shared by
// the contact form and CSV import (and later the AI tools).
export const findDuplicateContacts = async (input: {
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
