import { z } from "zod";
import { isKnownAiModel } from "@/lib/ai/models";
import { SUB_STATUS_COLORS } from "@/lib/labels";

const MAX_THRESHOLD_DAYS = 365;

// Stale / closing-soon thresholds are admin-configurable (FR-5.3 AC), plus the
// on/off switch and repeat cadence for the "Deal needs attention" nudge.
// staleNudgeRepeatDays of 0 means nudge once per staleness episode. The
// enabled checkbox is absent from the form when unchecked, so the action
// resolves it to a boolean before validating here.
export const alertThresholdsSchema = z.object({
  staleDays: z.coerce.number().int().min(0).max(MAX_THRESHOLD_DAYS),
  closingSoonDays: z.coerce.number().int().min(0).max(MAX_THRESHOLD_DAYS),
  staleNudgeEnabled: z.boolean(),
  staleNudgeRepeatDays: z.coerce.number().int().min(0).max(MAX_THRESHOLD_DAYS),
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

// Which Claude model the in-app assistant runs on. Validated against the
// curated catalog so an unknown id can never be persisted.
export const aiModelSchema = z
  .string()
  .refine(isKnownAiModel, { message: "Choose a supported model" });

const MAX_AI_INSTRUCTIONS_LENGTH = 4000;

// Freeform team guidance appended to the assistant's system prompt. Empty is
// allowed (clears the instructions); the cap keeps a single paste from blowing
// the prompt budget.
export const aiInstructionsSchema = z
  .string()
  .trim()
  .max(MAX_AI_INSTRUCTIONS_LENGTH);

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

const MAX_SUB_STATUS_LABEL_LENGTH = 60;

// Create or rename a deal sub-status. `id` is absent when creating; `color` is
// one of the fixed palette keys (src/lib/labels.ts).
export const subStatusUpsertSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(MAX_SUB_STATUS_LABEL_LENGTH),
  color: z.enum(SUB_STATUS_COLORS),
});

export type SubStatusUpsertInput = z.infer<typeof subStatusUpsertSchema>;

// The full ordered list of (active) status ids, top to bottom.
export const reorderSubStatusesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

// Where the per-deal status control is offered. Both default on.
export const subStatusPlacementSchema = z.object({
  showOnBoard: z.boolean(),
  showOnDealPage: z.boolean(),
});

export type SubStatusPlacementInput = z.infer<typeof subStatusPlacementSchema>;
