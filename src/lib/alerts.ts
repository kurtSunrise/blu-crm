import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSetting, company, deal, pipelineStage } from "@/db/schema";
import { MS_PER_DAY } from "@/lib/format";

// Defaults match Blu's weekly report rules (FR-5.3); both are
// admin-configurable via /settings.
export const STALE_DAYS_KEY = "stale_days";
export const CLOSING_SOON_DAYS_KEY = "closing_soon_days";
export const STALE_NUDGE_ENABLED_KEY = "stale_nudge_enabled";
export const STALE_NUDGE_REPEAT_DAYS_KEY = "stale_nudge_repeat_days";
export const DEFAULT_STALE_DAYS = 7;
export const DEFAULT_CLOSING_SOON_DAYS = 14;
// Defaults preserve the original behaviour: the nudge is on and fires once per
// staleness episode (0 = no repeat).
export const DEFAULT_STALE_NUDGE_ENABLED = true;
export const DEFAULT_STALE_NUDGE_REPEAT_DAYS = 0;

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
