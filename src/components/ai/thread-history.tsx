"use client";

import {
  EllipsisVerticalIcon,
  HandshakeIcon,
  MessageSquareTextIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  pinned: boolean;
  preview: {
    firstMessage: string | null;
    lastMessage: string | null;
    messageCount: number;
  };
  status: "idle" | "awaiting_confirmation";
  title: string | null;
}

const SEARCH_DEBOUNCE_MS = 250;
const MAX_TITLE_LENGTH = 80;

const displayTitle = (thread: ThreadListEntry): string =>
  thread.title ?? "New conversation";

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

// Inline title editor swapped in place of the row: Enter or blur saves,
// Escape cancels without saving.
function ThreadRenameInput({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const cancelledRef = useRef(false);

  const save = () => {
    const trimmed = value.trim().slice(0, MAX_TITLE_LENGTH);
    if (!trimmed || trimmed === initial) {
      onCancel();
      return;
    }
    onSave(trimmed);
  };

  return (
    <div className="px-1 py-1.5">
      <Input
        aria-label="Conversation title"
        autoFocus
        className="min-h-11"
        maxLength={MAX_TITLE_LENGTH}
        onBlur={() => {
          if (!cancelledRef.current) {
            save();
          }
        }}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelledRef.current = true;
            onCancel();
          }
        }}
        value={value}
      />
    </div>
  );
}

function ThreadRowMenu({
  onDelete,
  onRename,
  onTogglePin,
  thread,
}: {
  onDelete: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  thread: ThreadListEntry;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Options for ${displayTitle(thread)}`}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <EllipsisVerticalIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className="min-h-11" onClick={onRename}>
          <PencilIcon aria-hidden />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11" onClick={onTogglePin}>
          {thread.pinned ? <PinOffIcon aria-hidden /> : <PinIcon aria-hidden />}
          {thread.pinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11"
          onClick={onDelete}
          variant="destructive"
        >
          <Trash2Icon aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
        "flex min-h-11 min-w-0 flex-1 flex-col gap-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/50",
        active && "bg-accent"
      )}
      onClick={() => onSelect(thread.id)}
      type="button"
    >
      <span className="line-clamp-1 flex items-center gap-1.5 font-medium text-sm">
        {thread.pinned ? (
          <PinIcon aria-hidden className="size-3 shrink-0 text-blu" />
        ) : null}
        {displayTitle(thread)}
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

interface ThreadGroup {
  heading: string | null;
  threads: ThreadListEntry[];
}

// "Pinned" / "Recent" groups when anything is pinned; a flat list while
// searching (matches are matches, wherever they live).
const groupThreads = (
  threads: ThreadListEntry[],
  searching: boolean
): ThreadGroup[] => {
  const pinned = threads.filter((thread) => thread.pinned);
  if (searching || pinned.length === 0) {
    return [{ heading: null, threads }];
  }
  return [
    { heading: "Pinned", threads: pinned },
    {
      heading: "Recent",
      threads: threads.filter((thread) => !thread.pinned),
    },
  ];
};

// Recent conversations (M4 Phase 4): pick one to resume it in the panel.
// The search box queries the server (title, linked deal title/lead id, or
// contact name) across the whole history; each row's menu manages the
// thread (rename, pin, delete).
export function ThreadHistory({
  activeThreadId,
  onDeleted,
  onSelect,
}: {
  activeThreadId: string | null;
  onDeleted?: (threadId: string) => void;
  onSelect: (threadId: string) => void;
}) {
  const [threads, setThreads] = useState<ThreadListEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] =
    useState<ThreadListEntry | null>(null);
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

  // Optimistic mutation helper: apply immediately, restore the previous list
  // and toast the failure if the request fails.
  const mutateThreads = (
    apply: (current: ThreadListEntry[]) => ThreadListEntry[],
    request: () => Promise<Response>,
    errorMessage: string
  ) => {
    const previous = threads;
    setThreads((current) => (current ? apply(current) : current));
    request()
      .then((response) => {
        if (!response.ok) {
          setThreads(previous);
          toast.error(errorMessage);
        }
      })
      .catch(() => {
        setThreads(previous);
        toast.error(errorMessage);
      });
  };

  const renameThread = (threadId: string, title: string) => {
    setRenamingId(null);
    mutateThreads(
      (current) =>
        current.map((thread) =>
          thread.id === threadId ? { ...thread, title } : thread
        ),
      () =>
        fetch(`/api/chat/threads/${threadId}`, {
          body: JSON.stringify({ title }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        }),
      "Couldn't rename the conversation. Please try again."
    );
  };

  const togglePin = (thread: ThreadListEntry) => {
    const pinned = !thread.pinned;
    mutateThreads(
      (current) =>
        current.map((entry) =>
          entry.id === thread.id ? { ...entry, pinned } : entry
        ),
      () =>
        fetch(`/api/chat/threads/${thread.id}`, {
          body: JSON.stringify({ pinned }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        }),
      pinned
        ? "Couldn't pin the conversation. Please try again."
        : "Couldn't unpin the conversation. Please try again."
    );
  };

  const deleteThread = (thread: ThreadListEntry) => {
    setDeleteCandidate(null);
    mutateThreads(
      (current) => current.filter((entry) => entry.id !== thread.id),
      async () => {
        const response = await fetch(`/api/chat/threads/${thread.id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          toast.success("Conversation deleted");
        }
        return response;
      },
      "Couldn't delete the conversation. Please try again."
    );
    onDeleted?.(thread.id);
  };

  const searching = query.trim().length > 0;
  const groups = threads ? groupThreads(threads, searching) : [];

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
          {groups.map((group) => (
            <section key={group.heading ?? "all"}>
              {group.heading ? (
                <h3 className="px-4 pt-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {group.heading}
                </h3>
              ) : null}
              <ul className="flex flex-col gap-1 p-3">
                {group.threads.map((thread) => (
                  <li className="flex items-start gap-0.5" key={thread.id}>
                    {renamingId === thread.id ? (
                      <div className="min-w-0 flex-1">
                        <ThreadRenameInput
                          initial={displayTitle(thread)}
                          onCancel={() => setRenamingId(null)}
                          onSave={(title) => renameThread(thread.id, title)}
                        />
                      </div>
                    ) : (
                      <>
                        <ThreadRow
                          active={thread.id === activeThreadId}
                          onSelect={onSelect}
                          thread={thread}
                        />
                        <ThreadRowMenu
                          onDelete={() => setDeleteCandidate(thread)}
                          onRename={() => setRenamingId(thread.id)}
                          onTogglePin={() => togglePin(thread)}
                          thread={thread}
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      ) : null}

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteCandidate(null);
          }
        }}
        open={deleteCandidate !== null}
      >
        <DialogContent>
          <DialogTitle>Delete conversation?</DialogTitle>
          <DialogDescription>
            {deleteCandidate
              ? `"${displayTitle(deleteCandidate)}" will be removed from your history.`
              : null}
          </DialogDescription>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              className="min-h-11"
              onClick={() => setDeleteCandidate(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="min-h-11"
              onClick={() => {
                if (deleteCandidate) {
                  deleteThread(deleteCandidate);
                }
              }}
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
