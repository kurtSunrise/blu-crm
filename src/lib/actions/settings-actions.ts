"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appSetting, pipelineStage } from "@/db/schema";
import { AI_ASSISTANT_INSTRUCTIONS_KEY } from "@/lib/ai/assistant-instructions";
import { ATTACHMENT_DESCRIPTION_MODE_KEY } from "@/lib/ai/attachment-describe";
import { AI_MODEL_KEY } from "@/lib/ai/models";
import { CLOSING_SOON_DAYS_KEY, STALE_DAYS_KEY } from "@/lib/alerts";
import {
  PIPELINE_TOOLTIP_CONTACT_KEY,
  PIPELINE_TOOLTIP_ENABLED_KEY,
  PIPELINE_TOOLTIP_FOLLOWUP_KEY,
  PIPELINE_TOOLTIP_SCOPE_KEY,
} from "@/lib/pipeline-tooltip";
import {
  aiInstructionsSchema,
  aiModelSchema,
  alertThresholdsSchema,
  attachmentDescriptionModeSchema,
  pipelineTooltipSettingsSchema,
  stageWeightingSchema,
} from "@/lib/validation/settings";

export interface SettingsActionState {
  error?: string;
  saved?: boolean;
}

export const updateAlertThresholds = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  const parsed = alertThresholdsSchema.safeParse({
    staleDays: formData.get("staleDays"),
    closingSoonDays: formData.get("closingSoonDays"),
  });

  if (!parsed.success) {
    return { error: "Thresholds must be whole numbers of days (0 to 365)" };
  }

  const entries = [
    { key: STALE_DAYS_KEY, value: String(parsed.data.staleDays) },
    { key: CLOSING_SOON_DAYS_KEY, value: String(parsed.data.closingSoonDays) },
  ];

  for (const entry of entries) {
    await db
      .insert(appSetting)
      .values({ ...entry, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSetting.key,
        set: { value: entry.value, updatedAt: new Date() },
      });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/settings");
  return { saved: true };
};

export const updateAttachmentDescriptionMode = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  const parsed = attachmentDescriptionModeSchema.safeParse(
    formData.get("mode")
  );
  if (!parsed.success) {
    return { error: "Choose when file descriptions are generated" };
  }

  await db
    .insert(appSetting)
    .values({
      key: ATTACHMENT_DESCRIPTION_MODE_KEY,
      updatedAt: new Date(),
      value: parsed.data,
    })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value: parsed.data, updatedAt: new Date() },
    });

  revalidatePath("/settings/ai");
  return { saved: true };
};

// Which Claude model powers the in-app assistant, org-wide. Stored like every
// other app_setting; getAiModel reads it at request time.
export const updateAiModel = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  const parsed = aiModelSchema.safeParse(formData.get("model"));
  if (!parsed.success) {
    return { error: "Choose a supported model" };
  }

  await db
    .insert(appSetting)
    .values({
      key: AI_MODEL_KEY,
      updatedAt: new Date(),
      value: parsed.data,
    })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value: parsed.data, updatedAt: new Date() },
    });

  revalidatePath("/settings/ai");
  return { saved: true };
};

// Freeform team guidance appended to the assistant's system prompt. Empty
// clears the instructions; the static prompt then runs on its own again.
export const updateAssistantInstructions = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  const parsed = aiInstructionsSchema.safeParse(formData.get("instructions"));
  if (!parsed.success) {
    return { error: "Instructions must be 4000 characters or fewer" };
  }

  await db
    .insert(appSetting)
    .values({
      key: AI_ASSISTANT_INSTRUCTIONS_KEY,
      updatedAt: new Date(),
      value: parsed.data,
    })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value: parsed.data, updatedAt: new Date() },
    });

  revalidatePath("/settings/ai");
  return { saved: true };
};

// Pipeline deal-card hover tooltip: master switch plus per-field flags. Each
// checkbox is present in the form only when ticked, so absence means off.
export const updatePipelineTooltipSettings = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  const parsed = pipelineTooltipSettingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    scope: formData.get("scope") === "on",
    contact: formData.get("contact") === "on",
    followUp: formData.get("followUp") === "on",
  });

  if (!parsed.success) {
    return { error: "Could not save the tooltip preferences" };
  }

  const entries = [
    { key: PIPELINE_TOOLTIP_ENABLED_KEY, value: String(parsed.data.enabled) },
    { key: PIPELINE_TOOLTIP_SCOPE_KEY, value: String(parsed.data.scope) },
    { key: PIPELINE_TOOLTIP_CONTACT_KEY, value: String(parsed.data.contact) },
    {
      key: PIPELINE_TOOLTIP_FOLLOWUP_KEY,
      value: String(parsed.data.followUp),
    },
  ];

  for (const entry of entries) {
    await db
      .insert(appSetting)
      .values({ ...entry, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSetting.key,
        set: { value: entry.value, updatedAt: new Date() },
      });
  }

  revalidatePath("/settings");
  revalidatePath("/pipeline");
  return { saved: true };
};

// Forecast weightings drive the weighted pipeline value (FR-8.1); the form
// posts one `weighting-<stageId>` field per stage.
export const updateStageWeightings = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> => {
  const stages = await db.select({ id: pipelineStage.id }).from(pipelineStage);

  const updates: { id: string; weighting: number }[] = [];
  for (const stage of stages) {
    const raw = formData.get(`weighting-${stage.id}`);
    if (raw === null) {
      continue;
    }
    const parsed = stageWeightingSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: "Weightings must be whole percentages (0 to 100)" };
    }
    updates.push({ id: stage.id, weighting: parsed.data });
  }

  for (const update of updates) {
    await db
      .update(pipelineStage)
      .set({ weighting: update.weighting, updatedAt: new Date() })
      .where(eq(pipelineStage.id, update.id));
  }

  revalidatePath("/reports");
  revalidatePath("/reports/weekly");
  revalidatePath("/settings");
  return { saved: true };
};
