import { like } from "drizzle-orm";
import { db } from "@/db";
import { deal } from "@/db/schema";

const LEAD_SEQUENCE_PAD = 3;
const LEAD_ID_PATTERN = /^BLU-\d{4}-(\d+)$/;

// Lead IDs are BLU-[YYYY]-[###], sequential per year, unique and immutable
// (FR-1.5). Caller should retry once on a unique-constraint violation since
// concurrent quick-adds can race for the same sequence number.
export const nextLeadId = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = `BLU-${year}-`;
  const existing = await db
    .select({ leadId: deal.leadId })
    .from(deal)
    .where(like(deal.leadId, `${prefix}%`));

  let highest = 0;
  for (const row of existing) {
    const match = row.leadId.match(LEAD_ID_PATTERN);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }

  const sequence = String(highest + 1).padStart(LEAD_SEQUENCE_PAD, "0");
  return `${prefix}${sequence}`;
};
