import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { notification, user } from "@/db/schema";
import { markAllNotificationsRead } from "@/lib/actions/notification-actions";
import { formatDateAwst, formatDateTimeAwst } from "@/lib/format";
import { sweepOverdueFollowUpNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface NotificationPayload {
  action?: string;
  dealId?: string;
  dealTitle?: string;
  dueDate?: string;
  leadId?: string;
}

const describe = (
  type: string,
  payload: NotificationPayload
): { title: string; detail: string | null } => {
  switch (type) {
    case "handover_to_delivery":
      return {
        title: "Handover to delivery",
        detail: `${payload.dealTitle ?? "A deal"} was won. Over to you for delivery.`,
      };
    case "follow_up_overdue":
      return {
        title: "Follow-up overdue",
        detail: `${payload.action ?? "A follow-up"} on ${payload.dealTitle ?? "a deal"}${
          payload.dueDate
            ? ` was due ${formatDateAwst(new Date(payload.dueDate))}`
            : ""
        }`,
      };
    case "quote_viewed":
      return {
        title: "Quote viewed",
        detail: `The client just opened the quote on ${payload.dealTitle ?? "a deal"}. Good time to follow up.`,
      };
    case "lead_assigned":
      return {
        title: "New lead assigned to you",
        detail: `${payload.dealTitle ?? "A lead"}${payload.leadId ? ` (${payload.leadId})` : ""} is yours to work.`,
      };
    default:
      return { title: type.replaceAll("_", " "), detail: null };
  }
};

export default async function NotificationsPage() {
  // No background scheduler in V1, so overdue follow-up notifications are
  // generated when this surface loads (FR-11.1).
  await sweepOverdueFollowUpNotifications();

  const rows = await db
    .select({
      id: notification.id,
      type: notification.type,
      payload: notification.payload,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      recipientName: user.name,
    })
    .from(notification)
    .leftJoin(user, eq(notification.userId, user.id))
    .orderBy(desc(notification.createdAt));

  const hasUnread = rows.some((row) => row.readAt === null);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">Notifications</h1>
        {hasUnread && (
          <form action={markAllNotificationsRead}>
            <Button className="h-11" type="submit" variant="secondary">
              Mark all read
            </Button>
          </form>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing yet. Won handovers and overdue follow-ups will land here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const payload = (row.payload ?? {}) as NotificationPayload;
            const { title, detail } = describe(row.type, payload);
            const isUnread = row.readAt === null;
            const body = (
              <>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{title}</p>
                  {isUnread && <Badge>New</Badge>}
                </div>
                {detail && <p className="text-sm">{detail}</p>}
                <p className="text-muted-foreground text-xs">
                  {formatDateTimeAwst(row.createdAt)}
                  {row.recipientName ? ` · for ${row.recipientName}` : ""}
                </p>
              </>
            );
            const className = cn(
              "flex flex-col gap-1 rounded-lg border bg-card p-3",
              isUnread && "border-blu/60"
            );
            return (
              <li key={row.id}>
                {payload.dealId ? (
                  <Link className={className} href={`/deals/${payload.dealId}`}>
                    {body}
                  </Link>
                ) : (
                  <div className={className}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
