import { and, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { contact } from "@/db/schema";

// Org-wide duplicate scan for the briefing's data-hygiene section: how many
// email/phone values are shared by more than one live contact. Counts groups
// (one nag per clash), not rows, so a pair reads as "1 possible duplicate".
export const countDuplicateContactGroups = async (): Promise<number> => {
  const result = await db.execute(sql`
    select count(*)::int as groups from (
      select lower(${contact.email}) as duplicate_key
      from ${contact}
      where ${contact.email} is not null and ${contact.deletedAt} is null
      group by 1 having count(*) > 1
      union all
      select ${contact.phone} as duplicate_key
      from ${contact}
      where ${contact.phone} is not null and ${contact.deletedAt} is null
      group by 1 having count(*) > 1
    ) duplicates
  `);
  const [row] = result.rows as { groups: number }[];
  return row ? Number(row.groups) : 0;
};

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
