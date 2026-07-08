"use client";

import { MessageSquarePlusIcon } from "lucide-react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ThreadListItem } from "@/lib/ai/threads";
import { formatRelativeDayAwst } from "@/lib/format";

const displayTitle = (thread: ThreadListItem): string =>
  thread.title ?? "New conversation";

// The deal page's "AI conversations" card: lists the viewer's chats linked to
// this deal and opens one in the dock on tap. "New chat" starts a fresh
// conversation; because the deal page keeps its entity beacon mounted, the
// first message becomes a deal-linked thread with no extra plumbing.
export function DealChatsList({ threads }: { threads: ThreadListItem[] }) {
  const { openAssistantOnThread, startNewAssistantChat } = useAiAssistant();

  return (
    <div className="flex flex-col gap-3">
      {threads.length === 0 ? (
        <p className="text-muted-foreground text-sm">No conversations yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                className="flex min-h-11 w-full flex-col gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50"
                onClick={() => openAssistantOnThread(thread.id)}
                type="button"
              >
                <span className="line-clamp-1 font-medium text-sm">
                  {displayTitle(thread)}
                </span>
                {thread.preview.lastMessage ? (
                  <span className="line-clamp-2 text-muted-foreground text-xs">
                    {thread.preview.lastMessage}
                  </span>
                ) : null}
                <span className="flex items-center gap-2 text-muted-foreground text-xs">
                  {thread.lastMessageAt
                    ? formatRelativeDayAwst(new Date(thread.lastMessageAt))
                    : "No messages"}
                  {thread.status === "awaiting_confirmation" ? (
                    <Badge variant="secondary">Awaiting confirmation</Badge>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        className="w-fit"
        onClick={() => startNewAssistantChat()}
        size="sm"
        type="button"
        variant="outline"
      >
        <MessageSquarePlusIcon aria-hidden className="size-4" />
        New chat
      </Button>
    </div>
  );
}
