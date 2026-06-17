import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSetting } from "@/db/schema";

// Hover tooltip on pipeline deal cards. The master switch plus one key per
// optional field, each stored as a separate app_setting row (the same
// pattern as the alert thresholds).
export const PIPELINE_TOOLTIP_ENABLED_KEY = "pipeline_tooltip_enabled";
export const PIPELINE_TOOLTIP_SCOPE_KEY = "pipeline_tooltip_scope";
export const PIPELINE_TOOLTIP_CONTACT_KEY = "pipeline_tooltip_contact";
export const PIPELINE_TOOLTIP_FOLLOWUP_KEY = "pipeline_tooltip_followup";

// Default on so the feature is discoverable once shipped.
const DEFAULT_PIPELINE_TOOLTIP = true;

export interface PipelineTooltipSettings {
  contact: boolean;
  enabled: boolean;
  followUp: boolean;
  scope: boolean;
}

const TOOLTIP_KEYS = [
  PIPELINE_TOOLTIP_ENABLED_KEY,
  PIPELINE_TOOLTIP_SCOPE_KEY,
  PIPELINE_TOOLTIP_CONTACT_KEY,
  PIPELINE_TOOLTIP_FOLLOWUP_KEY,
];

// Booleans are stored as "true"/"false" strings; only an explicit "false"
// turns a setting off, so an unset key keeps the default.
const parseFlag = (value: string | undefined): boolean =>
  value === undefined ? DEFAULT_PIPELINE_TOOLTIP : value !== "false";

export const getPipelineTooltipSettings =
  async (): Promise<PipelineTooltipSettings> => {
    const rows = await db
      .select({ key: appSetting.key, value: appSetting.value })
      .from(appSetting)
      .where(inArray(appSetting.key, TOOLTIP_KEYS));

    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    return {
      enabled: parseFlag(byKey.get(PIPELINE_TOOLTIP_ENABLED_KEY)),
      scope: parseFlag(byKey.get(PIPELINE_TOOLTIP_SCOPE_KEY)),
      contact: parseFlag(byKey.get(PIPELINE_TOOLTIP_CONTACT_KEY)),
      followUp: parseFlag(byKey.get(PIPELINE_TOOLTIP_FOLLOWUP_KEY)),
    };
  };
