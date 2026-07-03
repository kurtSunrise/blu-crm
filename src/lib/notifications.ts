import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  appSetting,
  notification,
  notificationPreference,
  user,
} from "@/db/schema";
import {
  NOTIFICATION_TYPE_ORDER,
  type NotificationPayload,
  type NotificationType,
} from "@/lib/notification-types";

// Central emission path for every in-app notification (FR-11.1). Applies
// actor suppression, per-user preference filtering, and insert-time dedup so
// call sites stay one-liners.

export interface NotificationEntry {
  // Subject-scoped idempotency key (e.g. "follow_up_overdue:{followUpId}").
  // The stored key appends the recipient id; the unique index makes re-sweeps
  // no-ops. Omit for one-shot events.
  dedupeKey?: string;
  payload: NotificationPayload;
  recipientId: string;
}

interface EmitNotificationInput {
  // The acting user, if any; matching recipients are skipped so nobody is
  // notified about their own action.
  actorId?: string | null;
  dedupeKey?: string;
  payload: NotificationPayload;
  recipientIds: readonly string[];
  type: NotificationType;
}

// Batch path used by the sweeps: one preference query and one bulk insert
// regardless of candidate count (sequential per-row queries are what stalled
// renders on workerd before).
export const emitNotificationBatch = async (
  type: NotificationType,
  entries: readonly NotificationEntry[]
): Promise<number> => {
  try {
    if (entries.length === 0) {
      return 0;
    }
    const candidateIds = [
      ...new Set(entries.map((entry) => entry.recipientId)),
    ];

    const muted = await db
      .select({ userId: notificationPreference.userId })
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.type, type),
          eq(notificationPreference.enabled, false),
          inArray(notificationPreference.userId, candidateIds)
        )
      );
    const mutedIds = new Set(muted.map((row) => row.userId));
    const deliverable = entries.filter(
      (entry) => !mutedIds.has(entry.recipientId)
    );
    if (deliverable.length === 0) {
      return 0;
    }

    const inserted = await db
      .insert(notification)
      .values(
        deliverable.map((entry) => ({
          userId: entry.recipientId,
          type,
          payload: entry.payload,
          dedupeKey: entry.dedupeKey
            ? `${entry.dedupeKey}:${entry.recipientId}`
            : undefined,
        }))
      )
      .onConflictDoNothing({ target: notification.dedupeKey })
      .returning({ id: notification.id });
    return inserted.length;
  } catch (error) {
    // A notification must never fail the mutation that triggered it.
    console.error("[notify] failed to emit notifications", type, error);
    return 0;
  }
};

export const emitNotification = async (
  input: EmitNotificationInput
): Promise<void> => {
  const recipients = [...new Set(input.recipientIds)].filter(
    (id) => id !== input.actorId
  );
  await emitNotificationBatch(
    input.type,
    recipients.map((recipientId) => ({
      recipientId,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
    }))
  );
};

// Initial state for the preferences form: explicit rows override the
// enabled-by-default rule.
export const getNotificationPreferenceMap = async (
  userId: string
): Promise<Record<NotificationType, boolean>> => {
  const rows = await db
    .select({
      type: notificationPreference.type,
      enabled: notificationPreference.enabled,
    })
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, userId));

  const byType = new Map(rows.map((row) => [row.type, row.enabled]));
  const result = {} as Record<NotificationType, boolean>;
  for (const type of NOTIFICATION_TYPE_ORDER) {
    result[type] = byType.get(type) ?? true;
  }
  return result;
};

// Admin-configured recipients for company-level events (replaces the old
// hardcoded handover email). Falls back to all active admins until set.
export const HANDOVER_RECIPIENT_IDS_KEY = "handover_recipient_ids";

export const getHandoverRecipientIds = async (): Promise<string[]> => {
  const [setting] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, HANDOVER_RECIPIENT_IDS_KEY))
    .limit(1);

  if (setting) {
    try {
      const parsed: unknown = JSON.parse(setting.value);
      if (
        Array.isArray(parsed) &&
        parsed.every((id): id is string => typeof id === "string")
      ) {
        if (parsed.length === 0) {
          return [];
        }
        // Drop stale ids (deleted or disabled users) at read time.
        const active = await db
          .select({ id: user.id })
          .from(user)
          .where(and(inArray(user.id, parsed), eq(user.disabled, false)));
        return active.map((row) => row.id);
      }
    } catch {
      // Malformed setting value; fall through to the admin default.
    }
  }

  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.disabled, false)));
  return admins.map((row) => row.id);
};
