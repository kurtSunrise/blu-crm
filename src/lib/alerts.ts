import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSetting, company, deal, pipelineStage, quote } from "@/db/schema";
import { MS_PER_DAY } from "@/lib/format";

// Defaults match Blu's weekly report rules (FR-5.3); both are
// admin-configurable via /settings.
export const STALE_DAYS_KEY = "stale_days";
export const CLOSING_SOON_DAYS_KEY = "closing_soon_days";
export const STALE_NUDGE_ENABLED_KEY = "stale_nudge_enabled";
export const STALE_NUDGE_REPEAT_DAYS_KEY = "stale_nudge_repeat_days";
export const QUOTE_NUDGE_ENABLED_KEY = "quote_nudge_enabled";
export const QUOTE_NUDGE_DAYS_KEY = "quote_nudge_days";
export const AUTO_FOLLOW_UP_STAGE_KEY = "auto_follow_up_stage_id";
export const AUTO_FOLLOW_UP_DAYS_KEY = "auto_follow_up_days";
export const DEFAULT_STALE_DAYS = 7;
export const DEFAULT_CLOSING_SOON_DAYS = 14;
// Defaults preserve the original behaviour: the nudge is on and fires once per
// staleness episode (0 = no repeat).
export const DEFAULT_STALE_NUDGE_ENABLED = true;
export const DEFAULT_STALE_NUDGE_REPEAT_DAYS = 0;
export const DEFAULT_QUOTE_NUDGE_ENABLED = true;
export const DEFAULT_QUOTE_NUDGE_DAYS = 5;
export const DEFAULT_AUTO_FOLLOW_UP_DAYS = 3;

export interface AlertThresholds {
  closingSoonDays: number;
  staleDays: number;
}

export interface StaleNudgeConfig {
  enabled: boolean;
  // 0 = nudge once per staleness episode; N = re-nudge every N days a deal
  // stays stale.
  repeatDays: number;
}

export interface QuoteNudgeConfig {
  // Days after sending with no client response before the owner is nudged.
  days: number;
  enabled: boolean;
}

export interface AutoFollowUpConfig {
  // Due-date offset for the auto-created follow-up.
  days: number;
  // null = the automation is off; otherwise the stage that triggers it.
  stageId: string | null;
}

const parseDays = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

export const getAlertThresholds = async (): Promise<AlertThresholds> => {
  const rows = await db
    .select({ key: appSetting.key, value: appSetting.value })
    .from(appSetting)
    .where(inArray(appSetting.key, [STALE_DAYS_KEY, CLOSING_SOON_DAYS_KEY]));

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    staleDays: parseDays(byKey.get(STALE_DAYS_KEY), DEFAULT_STALE_DAYS),
    closingSoonDays: parseDays(
      byKey.get(CLOSING_SOON_DAYS_KEY),
      DEFAULT_CLOSING_SOON_DAYS
    ),
  };
};

// Admin levers for the "Deal needs attention" sweep (whether it runs, and how
// often it re-nudges a still-stale deal). Absent settings fall back to the
// original behaviour.
export const getStaleNudgeConfig = async (): Promise<StaleNudgeConfig> => {
  const rows = await db
    .select({ key: appSetting.key, value: appSetting.value })
    .from(appSetting)
    .where(
      inArray(appSetting.key, [
        STALE_NUDGE_ENABLED_KEY,
        STALE_NUDGE_REPEAT_DAYS_KEY,
      ])
    );

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const enabledValue = byKey.get(STALE_NUDGE_ENABLED_KEY);
  return {
    enabled:
      enabledValue === undefined
        ? DEFAULT_STALE_NUDGE_ENABLED
        : enabledValue === "true",
    repeatDays: parseDays(
      byKey.get(STALE_NUDGE_REPEAT_DAYS_KEY),
      DEFAULT_STALE_NUDGE_REPEAT_DAYS
    ),
  };
};

// Admin levers for the "Quote awaiting response" nudge: whether the daily
// sweep runs, and how many quiet days after sending trigger it.
export const getQuoteNudgeConfig = async (): Promise<QuoteNudgeConfig> => {
  const rows = await db
    .select({ key: appSetting.key, value: appSetting.value })
    .from(appSetting)
    .where(
      inArray(appSetting.key, [QUOTE_NUDGE_ENABLED_KEY, QUOTE_NUDGE_DAYS_KEY])
    );

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const enabledValue = byKey.get(QUOTE_NUDGE_ENABLED_KEY);
  return {
    enabled:
      enabledValue === undefined
        ? DEFAULT_QUOTE_NUDGE_ENABLED
        : enabledValue === "true",
    days: parseDays(byKey.get(QUOTE_NUDGE_DAYS_KEY), DEFAULT_QUOTE_NUDGE_DAYS),
  };
};

// Stage-entry automation: when a deal moves into the configured stage, a
// chase follow-up is created automatically (empty stage id = off).
export const getAutoFollowUpConfig = async (): Promise<AutoFollowUpConfig> => {
  const rows = await db
    .select({ key: appSetting.key, value: appSetting.value })
    .from(appSetting)
    .where(
      inArray(appSetting.key, [
        AUTO_FOLLOW_UP_STAGE_KEY,
        AUTO_FOLLOW_UP_DAYS_KEY,
      ])
    );

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const stageId = byKey.get(AUTO_FOLLOW_UP_STAGE_KEY);
  return {
    stageId: stageId ? stageId : null,
    days: parseDays(
      byKey.get(AUTO_FOLLOW_UP_DAYS_KEY),
      DEFAULT_AUTO_FOLLOW_UP_DAYS
    ),
  };
};

export interface AlertDeal {
  companyName: string | null;
  createdAt: Date;
  expectedCloseDate: Date | null;
  fixedDate: Date | null;
  id: string;
  lastContactAt: Date | null;
  leadId: string;
  ownerId: string | null;
  stageName: string;
  title: string;
}

const openDealColumns = {
  id: deal.id,
  leadId: deal.leadId,
  title: deal.title,
  companyName: company.name,
  stageName: pipelineStage.name,
  ownerId: deal.ownerId,
  lastContactAt: deal.lastContactAt,
  createdAt: deal.createdAt,
  fixedDate: deal.fixedDate,
  expectedCloseDate: deal.expectedCloseDate,
};

// Open = not soft-deleted and not in a Won or Lost / Dormant stage.
const openDealFilter = and(
  isNull(deal.deletedAt),
  eq(pipelineStage.isWon, false),
  eq(pipelineStage.isLost, false)
);

// Deals with no logged contact for `staleDays`+ days ("needs attention").
// A deal that has never been contacted counts from its creation.
export const getStaleDeals = async (
  staleDays: number
): Promise<AlertDeal[]> => {
  const cutoff = new Date(Date.now() - staleDays * MS_PER_DAY);
  return await db
    .select(openDealColumns)
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .where(
      and(
        openDealFilter,
        lte(sql`coalesce(${deal.lastContactAt}, ${deal.createdAt})`, cutoff)
      )
    )
    .orderBy(asc(sql`coalesce(${deal.lastContactAt}, ${deal.createdAt})`));
};

// Deals whose fixed install/event/launch date or expected close date falls
// within `closingSoonDays` days, regardless of stage ("closing soon").
export const getClosingSoonDeals = async (
  closingSoonDays: number
): Promise<AlertDeal[]> => {
  const horizon = new Date(Date.now() + closingSoonDays * MS_PER_DAY);
  return await db
    .select(openDealColumns)
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .where(
      and(
        openDealFilter,
        or(lte(deal.fixedDate, horizon), lte(deal.expectedCloseDate, horizon))
      )
    )
    .orderBy(asc(sql`least(${deal.fixedDate}, ${deal.expectedCloseDate})`));
};

const MISSING_FIELDS_LIMIT = 200;

// Open deals missing the fields Blu's qualification hinges on: a fixed
// install/event/launch date, any value (estimated or quoted), or a confirmed
// decision-maker. Feeds the morning briefing's data-hygiene section.
export const getDealsMissingKeyFields = async (): Promise<AlertDeal[]> =>
  await db
    .select(openDealColumns)
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .where(
      and(
        openDealFilter,
        or(
          isNull(deal.fixedDate),
          and(isNull(deal.estimatedValueCents), isNull(deal.quotedValueCents)),
          eq(deal.decisionMakerConfirmed, false)
        )
      )
    )
    .orderBy(asc(deal.createdAt))
    .limit(MISSING_FIELDS_LIMIT);

export interface QuoteAwaitingResponse {
  dealId: string;
  dealTitle: string;
  leadId: string;
  ownerId: string | null;
  quoteId: string;
  sentAt: Date;
  valueCents: number | null;
}

const QUOTE_AWAITING_LIMIT = 200;

// Quotes the client has had for `days`+ days without accepting or declining
// (viewed counts as still awaiting: viewing is FR-6.2's own alert). Shared by
// the daily nudge sweep and the briefing's hygiene section so the "awaiting
// response" definition can never drift between the two.
export const getQuotesAwaitingResponse = async (
  days: number
): Promise<QuoteAwaitingResponse[]> => {
  const cutoff = new Date(Date.now() - days * MS_PER_DAY);
  const rows = await db
    .select({
      quoteId: quote.id,
      dealId: deal.id,
      dealTitle: deal.title,
      leadId: deal.leadId,
      ownerId: deal.ownerId,
      sentAt: quote.sentAt,
      valueCents: quote.valueCents,
    })
    .from(quote)
    .innerJoin(deal, eq(quote.dealId, deal.id))
    .where(
      and(
        isNull(deal.deletedAt),
        inArray(quote.status, ["sent", "viewed"]),
        isNull(quote.respondedAt),
        lte(quote.sentAt, cutoff)
      )
    )
    .orderBy(asc(quote.sentAt))
    .limit(QUOTE_AWAITING_LIMIT);

  return rows.flatMap((row) =>
    row.sentAt ? [{ ...row, sentAt: row.sentAt }] : []
  );
};
