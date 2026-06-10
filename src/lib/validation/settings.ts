import { z } from "zod";

const MAX_THRESHOLD_DAYS = 365;

// Stale / closing-soon thresholds are admin-configurable (FR-5.3 AC).
export const alertThresholdsSchema = z.object({
  staleDays: z.coerce.number().int().min(0).max(MAX_THRESHOLD_DAYS),
  closingSoonDays: z.coerce.number().int().min(0).max(MAX_THRESHOLD_DAYS),
});

export type AlertThresholdsInput = z.infer<typeof alertThresholdsSchema>;

const MAX_WEIGHTING_PERCENT = 100;

// Forecast weighting per pipeline stage, as a whole percentage (FR-8.1).
export const stageWeightingSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(MAX_WEIGHTING_PERCENT);

const MAX_STAGE_NAME_LENGTH = 60;

// Stage names label board columns and menus, so keep them short (FR-1.3).
export const stageNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_STAGE_NAME_LENGTH);
