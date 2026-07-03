"use client";

import {
  HandshakeIcon,
  MessageSquareTextIcon,
  SearchIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeDayAwst } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ThreadListEntry {
  context: { kind: "deal" | "contact"; label: string } | null;
  id: string;
  lastMessageAt: string | null;
  originPage: string | null;
  preview: {
    firstMessage: string | null;
    lastMessage: string | null;
    messageCount: number;
  };
  status: "idle" | "awaiting_confirmation";
  title: string | null;
}

const SEARCH_DEBOUNCE_MS = 250;

// Matches the composer's context chip so a conversation's record reads the
// same in both places.
function ContextChip({
  context,
}: {
  context: NonNullable<ThreadListEntry["context"]>;
}) {
  const Icon = context.kind === "deal" ? HandshakeIcon : UserIcon;
  return (
    <span className="flex w-fit max-w-full items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-muted-foreground text-xs">
      <Icon aria-hidden className="size-3 shrink-0 text-blu" />
      <span className="truncate">{context.label}</span>
    </span>
  );
}

// A history row with a hover preview (same pattern as the pipeline card
// tooltip): how the conversation opened, its latest exchange, and its size.
function ThreadRow({
  active,
  onSelect,
  thread,
}: {
  active: boolean;
  onSelect: (threadId: string) => void;
  thread: ThreadListEntry;
}) {
  const row = (
    <button
      className={cn(
        "flex min-h-11 w-full flex-col gap-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/50",
        active && "bg-accent"
      )}
      onClick={() => onSelect(thread.id)}
      type="button"
    >
      <span className="line-clamp-1 font-medium text-sm">
        {thread.title ?? "New conversation"}
      </span>
      {thread.context ? <ContextChip context={thread.context} /> : null}
      <span className="flex items-center gap-2 text-muted-foreground text-xs">
        {thread.lastMessageAt
          ? formatRelativeDayAwst(new Date(thread.lastMessageAt))
          : "No messages"}
        {thread.status === "awaiting_confirmation" ? (
          <Badge variant="secondary">Awaiting confirmation</Badge>
        ) : null}
      </span>
    </button>
  );

  const tooltipRows: { label: string; value: string }[] = [];
  if (thread.preview.firstMessage) {
    tooltipRows.push({
      label: "Opened with",
      value: thread.preview.firstMessage,
    });
  }
  if (
    thread.preview.lastMessage &&
    thread.preview.lastMessage !== thread.preview.firstMessage
  ) {
    tooltipRows.push({ label: "Latest", value: thread.preview.lastMessage });
  }
  if (thread.preview.messageCount > 0) {
    tooltipRows.push({
      label: "Messages",
      value: String(thread.preview.messageCount),
    });
  }
  if (tooltipRows.length === 0) {
    return row;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipContent align="start" className="max-w-xs" side="left">
        <dl className="flex flex-col gap-1.5 text-left">
          {tooltipRows.map((entry) => (
            <div key={entry.label}>
              <dt className="font-medium">{entry.label}</dt>
              <dd className="text-background/70">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

// Recent conversations (M4 Phase 4): pick one to resume it in the panel.
// The search box queries the server (title, linked deal title/lead id, or
// contact name) across the whole history, not just the visible page.
export function ThreadHistory({
  activeThreadId,
  onSelect,
}: {
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
}) {
  const [threads, setThreads] = useState<ThreadListEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const searchId = useId();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const trimmed = query.trim();
        const url = trimmed
          ? `/api/chat/threads?q=${encodeURIComponent(trimmed)}`
          : "/api/chat/threads";
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Thread list failed: ${response.status}`);
        }
        const payload = (await response.json()) as {
          threads: ThreadListEntry[];
        };
        if (!cancelled) {
          setThreads(payload.threads);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };
    // Debounce keystrokes; the initial load fires after the same short
    // delay, which is imperceptible against the fetch itself.
    const timer = setTimeout(load, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const searching = query.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative shrink-0 border-b p-3">
        <label className="sr-only" htmlFor={searchId}>
          Search conversations
        </label>
        <SearchIcon
          aria-hidden
          className="absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          className="min-h-10 pl-9"
          id={searchId}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title, deal, or contact…"
          type="search"
          value={query}
        />
      </div>

      {failed ? (
        <p className="px-4 py-6 text-muted-foreground text-sm" role="status">
          Could not load your conversations. Close and reopen history to retry.
        </p>
      ) : null}

      {!failed && threads === null ? (
        <div aria-busy="true" className="flex flex-col gap-2 p-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}

      {!failed && threads?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <MessageSquareTextIcon
            aria-hidden
            className="size-6 text-muted-foreground"
          />
          <p className="text-muted-foreground text-sm">
            {searching
              ? "No conversations match that search."
              : "No conversations yet. Ask the assistant something to start one."}
          </p>
        </div>
      ) : null}

      {!failed && threads && threads.length > 0 ? (
        <nav
          aria-label="Conversation history"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <ul className="flex flex-col gap-1 p-3">
            {threads.map((thread) => (
              <li key={thread.id}>
                <ThreadRow
                  active={thread.id === activeThreadId}
                  onSelect={onSelect}
                  thread={thread}
                />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
