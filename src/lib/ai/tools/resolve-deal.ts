import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { deal } from "@/db/schema";

// Deal-targeting write tools receive whatever handle the model has on hand,
// which is usually the human lead reference (e.g. BLU-2026-921) from the page
// context or a card, not the internal UUID the mutations' foreign keys need.
// Resolve either form to the internal id so a write succeeds without forcing an
// extra get_deal round-trip. Internal ids are UUIDs and lead refs are BLU-...,
// so matching both columns can never collide.

export const resolveDealId = async (
  idOrLeadId: string
): Promise<string | null> => {
  const value = idOrLeadId.trim();
  if (value.length === 0) {
    return null;
  }
  const [row] = await db
    .select({ id: deal.id })
    .from(deal)
    .where(or(eq(deal.id, value), eq(deal.leadId, value)))
    .limit(1);
  return row?.id ?? null;
};

// Shared description for the deal handle field across write tools.
export const DEAL_HANDLE_DESCRIPTION =
  "The deal's internal id or its lead reference (e.g. BLU-2026-921), from get_deal, query_deals, or the page context";
