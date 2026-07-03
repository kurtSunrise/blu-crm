"use client";

import { Check, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { notifyNotificationsChanged } from "@/components/notification-bell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "@/lib/actions/notification-actions";
import { cn } from "@/lib/utils";

// Client islands for the notifications feed: each card marks itself read on
// tap-through, and the read/unread toggle syncs the bell badge instantly via
// the shared custom event.

interface NotificationItemProps {
  detail: string | null;
  href: string | null;
  id: string;
  isUnread: boolean;
  timestampLabel: string;
  title: string;
}

export function NotificationItem({
  id,
  title,
  detail,
  timestampLabel,
  href,
  isUnread,
}: NotificationItemProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const openNotification = () => {
    if (isUnread) {
      // Fire and forget: navigation should never wait on the read receipt.
      markNotificationRead({ id })
        .then(() => notifyNotificationsChanged())
        .catch(() => {
          // Best-effort; the row stays unread and can be toggled later.
        });
    }
  };

  const toggleRead = () => {
    startTransition(async () => {
      try {
        const action = isUnread ? markNotificationRead : markNotificationUnread;
        const result = await action({ id });
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        notifyNotificationsChanged();
        router.refresh();
      } catch {
        toast.error("Couldn't update the notification. Please try again.");
      }
    });
  };

  const body = (
    <>
      <div className="flex items-center gap-2">
        <p className="font-medium text-sm">{title}</p>
        {isUnread && <Badge>New</Badge>}
      </div>
      {detail && <p className="text-sm">{detail}</p>}
      <p className="text-muted-foreground text-xs">{timestampLabel}</p>
    </>
  );

  const cardClassName = cn(
    "flex min-w-0 flex-1 flex-col gap-1 p-3",
    !isUnread && "text-muted-foreground"
  );

  return (
    <div
      className={cn(
        "flex items-stretch rounded-lg border bg-card",
        isUnread && "border-blu/60"
      )}
    >
      {href ? (
        <Link className={cardClassName} href={href} onClick={openNotification}>
          {body}
        </Link>
      ) : (
        <div className={cardClassName}>{body}</div>
      )}
      <div className="flex items-center pr-2">
        <Button
          aria-label={isUnread ? "Mark as read" : "Mark as unread"}
          className="size-11 text-muted-foreground"
          disabled={isPending}
          onClick={toggleRead}
          size="icon"
          title={isUnread ? "Mark as read" : "Mark as unread"}
          type="button"
          variant="ghost"
        >
          {isUnread ? (
            <Check aria-hidden className="size-5" />
          ) : (
            <Undo2 aria-hidden className="size-5" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function MarkAllNotificationsReadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const markAll = () => {
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
        notifyNotificationsChanged();
        router.refresh();
      } catch {
        toast.error("Couldn't mark notifications read. Please try again.");
      }
    });
  };

  return (
    <Button
      className="h-11"
      disabled={isPending}
      onClick={markAll}
      type="button"
      variant="secondary"
    >
      Mark all read
    </Button>
  );
}
