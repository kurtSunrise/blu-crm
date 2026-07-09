import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deal } from "@/db/schema";
import { resolveStaleNudges } from "@/lib/notifications";

// Single write path for "a deal was engaged" (PRD FR-11.1). Stamping
// deal.lastContactAt is what resets the staleness clock the "Deal needs
// attention" sweep reads (src/lib/alerts.ts, getStaleDeals), so every action
// that counts as working a deal — logging an activity, completing a follow-up,
// sending a quote, advancing the stage — routes through here instead of
// stamping inline. It also clears any outstanding stale nudge so recent
// contact silences the feed immediately, not just on the next sweep.
export const touchDealContact = async (
  dealId: string,
  at: Date = new Date()
): Promise<void> => {
  await db
    .update(deal)
    .set({ lastContactAt: at, updatedAt: at })
    .where(eq(deal.id, dealId));

  await resolveStaleNudges(dealId);
};
