"use client";

import { useEffect, useState } from "react";

// Unread badge data for the bell in the app shell. One instance of the hook
// serves both nav surfaces (desktop sidebar and mobile header): call it once
// in the shell and pass the count down.

const POLL_INTERVAL_MS = 45_000;
const MAX_BADGE_COUNT = 9;

// Dispatched (window CustomEvent) by client callers right after a mark-read /
// mark-unread action so the badge updates instantly instead of on the next poll.
export const NOTIFICATIONS_CHANGED_EVENT = "blu:notifications-changed";

export const notifyNotificationsChanged = (): void => {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
};

export function useUnreadNotificationCount(pathname: string): number {
  const [unreadCount, setUnreadCount] = useState(0);

  // Refetches on mount, on an interval while the tab is visible, when the tab
  // becomes visible again, on navigation (pathname dep), and on the custom
  // change event.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is a deliberate refetch trigger for navigation, not data used inside the effect
  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      fetch("/api/notifications/unread-count")
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const data = (await response.json()) as { count?: number };
          if (!cancelled && typeof data.count === "number") {
            setUnreadCount(data.count);
          }
        })
        .catch(() => {
          // Transient network failure: keep the last known count.
        });
    };

    let interval: number | undefined;
    const stopPolling = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };
    const startPolling = () => {
      stopPolling();
      interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }
      refresh();
      startPolling();
    };

    refresh();
    startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    };
  }, [pathname]);

  return unreadCount;
}

export const unreadAriaLabel = (label: string, count: number): string =>
  count > 0 ? `${label}, ${count} unread` : label;

// Small pill anchored to the bell icon. Purely decorative for screen readers;
// the count is announced via the parent link's aria-label.
export function NotificationBadge({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }
  return (
    <span
      aria-hidden
      className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-blu px-1 font-medium text-[10px] text-white leading-none"
    >
      {count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : count}
    </span>
  );
}
