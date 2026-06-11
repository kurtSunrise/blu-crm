"use client";

import { MessageSquareTextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeDayAwst } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ThreadListEntry {
  id: string;
  lastMessageAt: string | null;
  originPage: string | null;
  status: "idle" | "awaiting_confirmation";
  title: string | null;
}

// Recent conversations (M4 Phase 4): pick one to resume it in the panel.
// Fetched fresh each time the view opens; the list is small by design.
export function ThreadHistory({
  activeThreadId,
  onSelect,
}: {
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
}) {
  const [threads, setThreads] = useState<ThreadListEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/chat/threads");
        if (!response.ok) {
          throw new Error(`Thread list failed: ${response.status}`);
        }
        const payload = (await response.json()) as {
          threads: ThreadListEntry[];
        };
        if (!cancelled) {
          setThreads(payload.threads);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p className="px-4 py-6 text-muted-foreground text-sm" role="status">
        Could not load your conversations. Close and reopen history to retry.
      </p>
    );
  }

  if (threads === null) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2 p-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <MessageSquareTextIcon
          aria-hidden
          className="size-6 text-muted-foreground"
        />
        <p className="text-muted-foreground text-sm">
          No conversations yet. Ask the assistant something to start one.
        </p>
      </div>
    );
  }

  return (
    <nav aria-label="Conversation history" className="h-full overflow-y-auto">
      <ul className="flex flex-col gap-1 p-3">
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              className={cn(
                "flex min-h-11 w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/50",
                thread.id === activeThreadId && "bg-accent"
              )}
              onClick={() => onSelect(thread.id)}
              type="button"
            >
              <span className="line-clamp-1 font-medium text-sm">
                {thread.title ?? "New conversation"}
              </span>
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
    </nav>
  );
}
