"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  appSetting,
  notification,
  notificationPreference,
  user,
} from "@/db/schema";
import { runAction } from "@/lib/actions/run-action";
import type { SettingsActionState } from "@/lib/actions/settings-actions";
import { NOTIFICATION_TYPE_ORDER } from "@/lib/notification-types";
import { HANDOVER_RECIPIENT_IDS_KEY } from "@/lib/notifications";
import { getSessionUserId, requireAdmin, requireSession } from "@/lib/session";

export interface NotificationActionState {
  error?: string;
}

const notificationIdSchema = z.object({ id: z.string().min(1) });

// Scoped to the caller: your own unread flags only.
export const markAllNotificationsRead = async (): Promise<void> => {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return;
    }

    await db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.userId, userId), isNull(notification.readAt)));

    revalidatePath("/notifications");
  } catch (error) {
    unstable_rethrow(error);
    console.error("[action-error]", error);
  }
};

const setNotificationReadAt = async (
  input: unknown,
  readAt: Date | null
): Promise<NotificationActionState> => {
  const parsed = notificationIdSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid notification" };
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return { error: "Sign in to update notifications" };
  }

  // The userId guard means nobody can toggle another user's rows.
  await db
    .update(notification)
    .set({ readAt })
    .where(
      and(eq(notification.id, parsed.data.id), eq(notification.userId, userId))
    );

  revalidatePath("/notifications");
  return {};
};

export const markNotificationRead = async (
  input: unknown
): Promise<NotificationActionState> =>
  runAction(async () => await setNotificationReadAt(input, new Date()));

export const markNotificationUnread = async (
  input: unknown
): Promise<NotificationActionState> =>
  runAction(async () => await setNotificationReadAt(input, null));

// One switch per registry type; a checkbox is present in the form only when
// ticked, so absence means muted. Rows are upserted for every type on save
// (absence of a row means enabled, so storing explicit values keeps future
// event types defaulting on).
export const updateNotificationPreferences = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> =>
  // Explicit type argument: every path here returns { saved: true }, and a
  // type with no `error` overlap fails runAction's weak-type constraint.
  runAction<SettingsActionState>(async () => {
    const session = await requireSession();

    const rows = NOTIFICATION_TYPE_ORDER.map((type) => ({
      userId: session.user.id,
      type,
      enabled: formData.get(`pref-${type}`) === "on",
      updatedAt: new Date(),
    }));

    await db
      .insert(notificationPreference)
      .values(rows)
      .onConflictDoUpdate({
        target: [notificationPreference.userId, notificationPreference.type],
        set: {
          enabled: sql`excluded.enabled`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    revalidatePath("/settings/notifications");
    return { saved: true };
  });

// Admin-configured recipients for handover_to_delivery (replaces the old
// hardcoded email). An empty selection is valid and means nobody is notified.
export const updateHandoverRecipients = async (
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> =>
  runAction(async () => {
    await requireAdmin();

    const submitted = formData
      .getAll("recipientIds")
      .filter((value): value is string => typeof value === "string");

    let recipientIds: string[] = [];
    if (submitted.length > 0) {
      const valid = await db
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.id, submitted));
      if (valid.length !== new Set(submitted).size) {
        return { error: "One or more selected users no longer exist" };
      }
      recipientIds = valid.map((row) => row.id);
    }

    const value = JSON.stringify(recipientIds);
    await db
      .insert(appSetting)
      .values({
        key: HANDOVER_RECIPIENT_IDS_KEY,
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appSetting.key,
        set: { value, updatedAt: new Date() },
      });

    revalidatePath("/settings/notifications");
    return { saved: true };
  });
