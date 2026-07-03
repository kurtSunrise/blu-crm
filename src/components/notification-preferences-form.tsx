"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateNotificationPreferences } from "@/lib/actions/notification-actions";
import type { SettingsActionState } from "@/lib/actions/settings-actions";
import {
  NOTIFICATION_TYPE_ORDER,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/notification-types";

export function NotificationPreferencesForm({
  preferences,
}: {
  preferences: Record<NotificationType, boolean>;
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateNotificationPreferences, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {NOTIFICATION_TYPE_ORDER.map((type) => {
          const meta = NOTIFICATION_TYPES[type];
          return (
            <label
              className="flex min-h-11 items-start gap-3 text-sm"
              key={type}
            >
              <input
                className="mt-0.5 size-5 accent-blu"
                defaultChecked={preferences[type]}
                name={`pref-${type}`}
                type="checkbox"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{meta.label}</span>
                <span className="text-muted-foreground text-xs">
                  {meta.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p className="text-sm" role="status">
          Preferences saved.
        </p>
      )}
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
