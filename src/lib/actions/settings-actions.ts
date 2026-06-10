"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { CLOSING_SOON_DAYS_KEY, STALE_DAYS_KEY } from "@/lib/alerts";
import { alertThresholdsSchema } from "@/lib/validation/settings";

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
