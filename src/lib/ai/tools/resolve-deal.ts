import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { deal, pipelineStage } from "@/db/schema";

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

// The move_deal_stage tool takes whatever stage handle the model has, which
// should be the human name from list_pipeline_stages so the confirmation card
// reads meaningfully (not a UUID). Resolve a name (case-insensitive) or, as a
// fallback, the internal id, to the row the mutation needs.
export const resolveStageId = async (
  handle: string
): Promise<{ id: string; name: string } | null> => {
  const value = handle.trim();
  if (value.length === 0) {
    return null;
  }
  const [row] = await db
    .select({ id: pipelineStage.id, name: pipelineStage.name })
    .from(pipelineStage)
    .where(
      or(
        eq(pipelineStage.id, value),
        sql`lower(${pipelineStage.name}) = lower(${value})`
      )
    )
    .limit(1);
  return row ?? null;
};

// Shared description for the stage handle field on move_deal_stage.
export const STAGE_HANDLE_DESCRIPTION =
  'The target stage\'s name exactly as returned by list_pipeline_stages (e.g. "Brief / Site Visit")';
