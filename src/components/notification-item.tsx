"use client";

import { Check, Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useTransition } from "react";
import { toast } from "sonner";
import { useAiAssistant } from "@/components/ai/ai-context";
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

// Proactive assistant notifications: their card opens the assistant on the
// thread the briefing lives in, instead of navigating anywhere.
const ASSISTANT_THREAD_TYPES = new Set(["weekly_report", "daily_briefing"]);

interface NotificationItemProps {
  dealId: string | null;
  dealTitle: string | null;
  detail: string | null;
  href: string | null;
  id: string;
  isUnread: boolean;
  threadId: string | null;
  timestampLabel: string;
  title: string;
  type: string;
}

export function NotificationItem({
  id,
  type,
  title,
  detail,
  timestampLabel,
  href,
  isUnread,
  threadId,
  dealId,
  dealTitle,
}: NotificationItemProps) {
  const router = useRouter();
  const { openAssistantOnThread, openAssistantWithPrompt } = useAiAssistant();
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

  // Briefing cards open the assistant on their thread; deal-linked cards
  // stay Links; the rest are plain text.
  const assistantThreadId = ASSISTANT_THREAD_TYPES.has(type) ? threadId : null;

  const openThread = () => {
    if (!assistantThreadId) {
      return;
    }
    openNotification();
    openAssistantOnThread(assistantThreadId);
  };

  const askAssistantAboutDeal = () => {
    openNotification();
    openAssistantWithPrompt(
      `What is the situation with ${dealTitle ?? "this deal"} and what should I do next?`
    );
  };

  let card: ReactNode;
  if (assistantThreadId) {
    card = (
      <button
        className={cn(cardClassName, "cursor-pointer text-left")}
        onClick={openThread}
        type="button"
      >
        {body}
      </button>
    );
  } else if (href) {
    card = (
      <Link className={cardClassName} href={href} onClick={openNotification}>
        {body}
      </Link>
    );
  } else {
    card = <div className={cardClassName}>{body}</div>;
  }

  return (
    <div
      className={cn(
        "flex items-stretch rounded-lg border bg-card",
        isUnread && "border-blu/60"
      )}
    >
      {card}
      <div className="flex items-center pr-2">
        {type === "stale_deal" && dealId && (
          <Button
            aria-label="Ask the assistant about this deal"
            className="size-11 text-muted-foreground"
            onClick={askAssistantAboutDeal}
            size="icon"
            title="Ask assistant"
            type="button"
            variant="ghost"
          >
            <Sparkles aria-hidden className="size-5 text-blu" />
          </Button>
        )}
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
