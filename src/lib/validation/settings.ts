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

// When the assistant generates and caches a description for a deal file:
// lazily on first view, or eagerly in the background on upload.
export const attachmentDescriptionModeSchema = z.enum(["lazy", "eager"]);

// Which fields the pipeline deal-card hover tooltip shows, plus its master
// on/off switch. Unchecked checkboxes are absent from the form, so the action
// resolves each flag to a boolean before validating here.
export const pipelineTooltipSettingsSchema = z.object({
  enabled: z.boolean(),
  scope: z.boolean(),
  contact: z.boolean(),
  followUp: z.boolean(),
});

export type PipelineTooltipSettingsInput = z.infer<
  typeof pipelineTooltipSettingsSchema
>;
