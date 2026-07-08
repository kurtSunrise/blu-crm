import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import Link from "next/link";
import {
  MarkAllNotificationsReadButton,
  NotificationItem,
} from "@/components/notification-item";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { notification } from "@/db/schema";
import { awstDateKey } from "@/lib/calendar";
import { formatDateTimeAwst, MS_PER_DAY } from "@/lib/format";
import { sweepOverdueFollowUpNotifications } from "@/lib/notification-sweeps";
import {
  describeNotification,
  type NotificationPayload,
  notificationHref,
} from "@/lib/notification-types";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface NotificationRow {
  createdAt: Date;
  id: string;
  payload: unknown;
  readAt: Date | null;
  type: string;
}

interface FeedSection {
  heading: string;
  rows: NotificationRow[];
}

// payload.threadId arrives with the proactive assistant notification types
// (weekly_report, daily_briefing); read it defensively so rows written
// before that field existed, or by older code, never break the feed.
const readThreadId = (payload: unknown): string | null => {
  if (payload && typeof payload === "object" && "threadId" in payload) {
    const value = (payload as { threadId?: unknown }).threadId;
    return typeof value === "string" ? value : null;
  }
  return null;
};

// Group the page's rows into Today / Yesterday / Earlier as the team
// experiences days in Perth.
const groupByDay = (rows: NotificationRow[], now: Date): FeedSection[] => {
  const todayKey = awstDateKey(now);
  const yesterdayKey = awstDateKey(new Date(now.getTime() - MS_PER_DAY));

  const sections: FeedSection[] = [
    { heading: "Today", rows: [] },
    { heading: "Yesterday", rows: [] },
    { heading: "Earlier", rows: [] },
  ];
  for (const row of rows) {
    const key = awstDateKey(row.createdAt);
    if (key === todayKey) {
      sections[0].rows.push(row);
    } else if (key === yesterdayKey) {
      sections[1].rows.push(row);
    } else {
      sections[2].rows.push(row);
    }
  }
  return sections.filter((section) => section.rows.length > 0);
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const [session, { before }] = await Promise.all([
    requireSession(),
    searchParams,
  ]);
  const userId = session.user.id;

  // Belt and braces alongside the 20-minute cron: an overdue follow-up shows
  // up the moment someone opens the feed, not on the next tick. Idempotent
  // via the dedupe keys, so overlapping with the cron is harmless.
  await sweepOverdueFollowUpNotifications();

  const beforeDate = before ? new Date(before) : null;
  const cursorFilter =
    beforeDate && !Number.isNaN(beforeDate.getTime())
      ? lt(notification.createdAt, beforeDate)
      : undefined;

  const [rows, [unreadRow]] = await Promise.all([
    db
      .select({
        id: notification.id,
        type: notification.type,
        payload: notification.payload,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .where(and(eq(notification.userId, userId), cursorFilter))
      .orderBy(desc(notification.createdAt))
      .limit(PAGE_SIZE + 1),
    db
      .select({ unread: count() })
      .from(notification)
      .where(and(eq(notification.userId, userId), isNull(notification.readAt))),
  ]);

  const hasOlder = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);
  const unreadCount = unreadRow?.unread ?? 0;
  const oldestVisible = visible.at(-1);
  const sections = groupByDay(visible, new Date());

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-4 md:py-6 lg:max-w-3xl">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">Notifications</h1>
        {unreadCount > 0 && <MarkAllNotificationsReadButton />}
      </header>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing yet. Lead assignments, quote views, follow-up reminders and
          handovers will land here.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section className="flex flex-col gap-2" key={section.heading}>
              <h2 className="font-medium text-muted-foreground text-sm">
                {section.heading}
              </h2>
              <ul className="flex flex-col gap-2">
                {section.rows.map((row) => {
                  const payload = (row.payload ?? {}) as NotificationPayload;
                  const { title, detail } = describeNotification(
                    row.type,
                    payload
                  );
                  return (
                    <li key={row.id}>
                      <NotificationItem
                        dealId={payload.dealId ?? null}
                        dealTitle={payload.dealTitle ?? null}
                        detail={detail}
                        href={notificationHref(row.type, payload)}
                        id={row.id}
                        isUnread={row.readAt === null}
                        threadId={readThreadId(row.payload)}
                        timestampLabel={formatDateTimeAwst(row.createdAt)}
                        title={title}
                        type={row.type}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {hasOlder && oldestVisible && (
            <Button
              className="h-11 self-center"
              nativeButton={false}
              render={
                <Link
                  href={`/notifications?before=${encodeURIComponent(
                    oldestVisible.createdAt.toISOString()
                  )}`}
                >
                  Show older
                </Link>
              }
              variant="outline"
            />
          )}
        </div>
      )}
    </main>
  );
}
