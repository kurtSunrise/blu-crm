"use client";

import { type ThreadMessageLike, useThreadRuntime } from "@assistant-ui/react";
import {
  ClipboardCopyIcon,
  HistoryIcon,
  Maximize2Icon,
  Minimize2Icon,
  Settings2Icon,
  SparklesIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useAiAssistant } from "@/components/ai/ai-context";
import { AiRuntimeProvider } from "@/components/ai/ai-runtime-provider";
import {
  type CitationRef,
  insertBeforeSourcesPart,
  normalizeCitations,
} from "@/components/ai/artifacts/citation-list";
import { ChatPanel } from "@/components/ai/chat-panel";
import type { ResumedConfirmationStatus } from "@/components/ai/confirmation-card";
import {
  type ExportMessageLike,
  serializeThreadToMarkdown,
} from "@/components/ai/thread-export";
import { ThreadHistory } from "@/components/ai/thread-history";
import { TooltipIconButton } from "@/components/ai/tooltip-icon-button";
import type { ConfirmationItem } from "@/lib/ai/stream-protocol";
import { cn } from "@/lib/utils";

// Launcher button used in the desktop sidebar and the mobile header. Forwards
// className/ref/props so it can be composed as a tooltip trigger (Base UI
// merges the trigger's props onto this button via its `render` prop).
export function AiLauncherButton({
  withLabel,
  className,
  ...props
}: { withLabel?: boolean } & React.ComponentProps<"button">) {
  const { open, setOpen } = useAiAssistant();

  if (withLabel) {
    return (
      <button
        aria-expanded={open}
        className={cn(
          "flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors",
          open
            ? "bg-accent font-medium text-blu"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          className
        )}
        type="button"
        {...props}
        onClick={() => setOpen(!open)}
      >
        <SparklesIcon aria-hidden className="size-4.5" />
        Assistant
        <kbd className="ml-auto font-sans text-muted-foreground text-xs">
          ⌘J
        </kbd>
      </button>
    );
  }

  return (
    <button
      aria-expanded={open}
      aria-label="Blu assistant"
      className={cn(
        "flex min-h-11 min-w-11 items-center justify-center rounded-md",
        open ? "text-blu" : "text-muted-foreground hover:text-foreground",
        className
      )}
      type="button"
      {...props}
      onClick={() => setOpen(!open)}
    >
      <SparklesIcon aria-hidden className="size-5" />
    </button>
  );
}

type ThreadFeedbackMap = Record<string, "up" | "down">;

interface ChatSession {
  epoch: number;
  // The user's saved thumbs ratings by message id, from the thread GET.
  initialFeedback: ThreadFeedbackMap;
  initialMessages: ThreadMessageLike[];
}

interface ResumedAttachment {
  contentType: string;
  fileName: string;
  id: string;
}

type ResumedPart =
  | { type: "artifact"; artifactType: string; data: unknown }
  | {
      type: "confirmation";
      input: unknown;
      status:
        | "pending"
        | "approved"
        | "denied"
        | "failed"
        | "skipped"
        | "unresolved";
      summary: string;
      toolName: string;
      toolUseId: string;
    };

interface ResumedMessage {
  attachments?: ResumedAttachment[];
  // Numbered citations for an assistant message; the resumed text already
  // contains the matching inline " [N]" markers.
  citations?: CitationRef[];
  id: string;
  parts?: ResumedPart[];
  role: "user" | "assistant";
  text: string;
}

interface ResumedThread {
  id: string;
  pendingToolUses?: ConfirmationItem[];
  status: string;
  title: string | null;
}

interface ResumedDataPart {
  data: unknown;
  name: string;
  type: "data";
}

// Persisted transcript parts become the same data content parts the live
// stream produces, so DataPartsRenderer re-renders cards on resume. A
// message's confirmation parts merge into ONE checklist card, exactly like
// the live confirmation_request: the card sends decisions for every item it
// shows, and the server treats missing decisions as skips, so splitting a
// plan across cards would silently skip the items the user never saw.
const toDataParts = (
  parts: ResumedPart[]
): { dataParts: ResumedDataPart[]; reasoningText: string | null } => {
  const dataParts: ResumedDataPart[] = [];
  const confirmations: Extract<ResumedPart, { type: "confirmation" }>[] = [];
  let reasoningText: string | null = null;
  for (const part of parts) {
    if (part.type === "artifact") {
      // A persisted "reasoning" artifact becomes a real reasoning content
      // part (not a data part) so it renders through the same collapsible
      // ReasoningSection as live turns, above the answer text.
      if (part.artifactType === "reasoning") {
        const text = (part.data as { text?: unknown } | null)?.text;
        if (typeof text === "string" && text.length > 0) {
          reasoningText = text;
        }
        continue;
      }
      dataParts.push({
        data: part.data,
        name: part.artifactType,
        type: "data",
      });
    } else {
      confirmations.push(part);
    }
  }
  if (confirmations.length === 0) {
    return { dataParts, reasoningText };
  }
  const items: ConfirmationItem[] = confirmations.map((part) => ({
    input: part.input,
    summary: part.summary,
    toolName: part.toolName,
    toolUseId: part.toolUseId,
  }));
  // Fully pending plans resume actionable (pendingConfirmation is re-seeded
  // from thread.pendingToolUses); anything else renders inert with each
  // item's audited outcome. A pending item inside a partly resolved group is
  // a crash orphan and displays as expired.
  const allPending = confirmations.every((part) => part.status === "pending");
  const itemStatuses: Record<string, ResumedConfirmationStatus> = {};
  if (!allPending) {
    for (const part of confirmations) {
      itemStatuses[part.toolUseId] =
        part.status === "pending" ? "unresolved" : part.status;
    }
  }
  dataParts.push({
    data: allPending ? { items } : { items, itemStatuses },
    name: "confirmation_request",
    type: "data",
  });
  return { dataParts, reasoningText };
};

type ResumedContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | ResumedDataPart;

const toThreadMessages = (messages: ResumedMessage[]): ThreadMessageLike[] =>
  messages.map((message) => {
    const { dataParts, reasoningText } = toDataParts(message.parts ?? []);
    if (message.role === "assistant") {
      // Resumed citations become the same single "citations" data part the
      // live stream folds (normalized: deduped by marker, marker order), and
      // sit before any persisted "sources" artifact to match the live order.
      const citations = normalizeCitations(message.citations ?? []);
      if (citations.length > 0) {
        insertBeforeSourcesPart(dataParts, {
          data: { citations },
          name: "citations",
          type: "data",
        });
      }
      // The persisted message id, in the same invisible message_meta data
      // part the live stream's `done` payload produces, so the feedback
      // thumbs work on resumed turns too.
      dataParts.push({
        data: { messageId: message.id },
        name: "message_meta",
        type: "data",
      });
    }
    const reasoningParts: ResumedContentPart[] = reasoningText
      ? [{ text: reasoningText, type: "reasoning" }]
      : [];
    const content: ResumedContentPart[] = message.text
      ? [...reasoningParts, { text: message.text, type: "text" }, ...dataParts]
      : [...reasoningParts, ...dataParts];
    // Part-only user rows (a confirmed write's artifacts ride the resume
    // message) render as assistant so cards never sit in the blue bubble.
    const role =
      message.role === "user" && !message.text && dataParts.length > 0
        ? "assistant"
        : message.role;
    return {
      // The server attachment id rides on `id`, matching the live composer
      // path, so the bubble's chip can fetch its thumbnail from the same R2
      // route.
      attachments: (message.attachments ?? []).map((attachment) => ({
        content: [],
        contentType: attachment.contentType,
        id: attachment.id,
        name: attachment.fileName,
        status: { type: "complete" as const },
        type: attachment.contentType.startsWith("image/")
          ? ("image" as const)
          : ("document" as const),
      })),
      content:
        content.length > 0
          ? content
          : [{ text: message.text, type: "text" as const }],
      id: message.id,
      role,
    };
  });

type ThreadMessagesGetter = () => readonly ExportMessageLike[];

// Hands the dock header a live getter for the current thread's runtime
// messages. The "Copy as Markdown" button sits outside AiRuntimeProvider, so
// it cannot use the runtime hooks itself; this bridge (mounted inside the
// provider) closes that gap without moving the header.
function ThreadExportBridge({
  getterRef,
}: {
  getterRef: MutableRefObject<ThreadMessagesGetter | null>;
}) {
  const threadRuntime = useThreadRuntime();
  useEffect(() => {
    getterRef.current = () => threadRuntime.getState().messages;
    return () => {
      getterRef.current = null;
    };
  }, [getterRef, threadRuntime]);
  return null;
}

// The assistant surface itself. Stays mounted while closed (hidden via CSS)
// so the conversation survives open/close. Mobile: full-screen overlay.
// Desktop: fixed 400px right sidebar; AppShell pads the main content.
// The runtime is keyed by a session epoch: "new chat" and resuming a thread
// from history each remount it (a LocalRuntime's messages are fixed at
// creation), while toggling the history view only hides the live chat.
export function AiAssistantDock() {
  const {
    clearRequestedNewChat,
    clearRequestedThread,
    clearVoiceAttachments,
    decisionRef,
    mentionsRef,
    open,
    requestedNewChat,
    requestedThread,
    setOpen,
    setPendingConfirmation,
    setThreadId,
    threadId,
    toggleWide,
    wide,
  } = useAiAssistant();
  const exportMessagesRef = useRef<ThreadMessagesGetter | null>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [session, setSession] = useState<ChatSession>({
    epoch: 0,
    initialFeedback: {},
    initialMessages: [],
  });

  const switchSession = useCallback(
    (
      nextThreadId: string | null,
      initialMessages: ThreadMessageLike[],
      initialFeedback: ThreadFeedbackMap = {}
    ) => {
      setThreadId(nextThreadId);
      setPendingConfirmation(null);
      decisionRef.current = null;
      // Composer-side staging belongs to the old session: drop any recorded
      // @-mention picks and unsent voice notes.
      mentionsRef.current = [];
      clearVoiceAttachments();
      setSession((current) => ({
        epoch: current.epoch + 1,
        initialFeedback,
        initialMessages,
      }));
      setView("chat");
    },
    [
      clearVoiceAttachments,
      decisionRef,
      mentionsRef,
      setPendingConfirmation,
      setThreadId,
    ]
  );

  const startNewChat = useCallback(
    () => switchSession(null, []),
    [switchSession]
  );

  // Serializes the visible thread client-side and copies it. Not async so
  // the handler type stays void; failures surface as a toast.
  const copyThreadAsMarkdown = () => {
    const messages = exportMessagesRef.current?.() ?? [];
    const markdown = serializeThreadToMarkdown(messages);
    if (!markdown) {
      toast("Nothing to copy yet. Start a conversation first.");
      return;
    }
    navigator.clipboard.writeText(markdown).then(
      () => toast.success("Conversation copied as Markdown."),
      () => toast.error("Could not copy the conversation.")
    );
  };

  const resumeThread = useCallback(
    async (resumeId: string, options?: { fallbackToNewChat?: boolean }) => {
      if (resumeId === threadId) {
        setView("chat");
        return;
      }
      const response = await fetch(`/api/chat/threads/${resumeId}`);
      if (!response.ok) {
        // A notification can outlive its thread. Fall back to a fresh chat
        // so the dock never opens onto a dead end.
        if (options?.fallbackToNewChat) {
          toast.error("That conversation is no longer available.");
          startNewChat();
        }
        return;
      }
      const payload = (await response.json()) as {
        feedback?: { messageId: string; rating: "up" | "down" }[];
        messages: ResumedMessage[];
        thread?: ResumedThread;
      };
      const initialFeedback: ThreadFeedbackMap = {};
      for (const entry of payload.feedback ?? []) {
        initialFeedback[entry.messageId] = entry.rating;
      }
      switchSession(
        resumeId,
        toThreadMessages(payload.messages),
        initialFeedback
      );
      // A thread paused on a write plan resumes actionable: re-seed the pending
      // confirmation so its card's buttons work again.
      const pendingToolUses = payload.thread?.pendingToolUses;
      if (pendingToolUses && pendingToolUses.length > 0) {
        setPendingConfirmation({ items: pendingToolUses });
      }
    },
    [threadId, switchSession, startNewChat, setPendingConfirmation]
  );

  // Thread-open requests from outside the dock (notification cards) load
  // through the exact resume path history selection uses. The request is
  // cleared first so a re-render mid-fetch cannot double-load.
  useEffect(() => {
    if (!requestedThread) {
      return;
    }
    clearRequestedThread();
    resumeThread(requestedThread.threadId, { fallbackToNewChat: true }).catch(
      () => {
        // Network failure: leave the dock on its current session.
      }
    );
  }, [requestedThread, clearRequestedThread, resumeThread]);

  // New-chat requests from outside the dock (the deal page's "New chat"
  // action) reset to an empty session. The detail page's entity beacon is
  // still mounted, so the first send links the new thread to that entity.
  useEffect(() => {
    if (!requestedNewChat) {
      return;
    }
    clearRequestedNewChat();
    startNewChat();
  }, [requestedNewChat, clearRequestedNewChat, startNewChat]);

  const handleThreadDeleted = (deletedThreadId: string) => {
    if (deletedThreadId === threadId) {
      startNewChat();
    }
  };

  return (
    <aside
      aria-label="Blu assistant"
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-background transition-[transform,width] duration-200 ease-out md:left-auto md:z-30 md:border-l",
        wide ? "md:w-[640px]" : "md:w-[400px]",
        open
          ? "translate-x-0 translate-y-0"
          : "translate-y-full md:translate-x-full md:translate-y-0"
      )}
      inert={!open}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b pr-2 pl-4">
        <div className="flex items-center gap-2">
          <SparklesIcon aria-hidden className="size-4 text-blu" />
          <h2 className="font-heading font-semibold text-sm">Blu assistant</h2>
        </div>
        <div className="flex items-center">
          {/* Width toggle, desktop-only. Set apart from the conversation
              actions with a divider so it reads as a panel control, not
              another chat action. */}
          <TooltipIconButton
            aria-pressed={wide}
            className="hidden md:flex"
            onClick={toggleWide}
            tooltip={wide ? "Narrow the panel" : "Widen the panel"}
          >
            {wide ? (
              <Minimize2Icon aria-hidden className="size-4.5" />
            ) : (
              <Maximize2Icon aria-hidden className="size-4.5" />
            )}
          </TooltipIconButton>
          <div className="mr-1 ml-0.5 hidden h-5 w-px bg-border md:block" />
          <TooltipIconButton onClick={startNewChat} tooltip="New conversation">
            <SquarePenIcon aria-hidden className="size-4.5" />
          </TooltipIconButton>
          <TooltipIconButton
            aria-pressed={view === "history"}
            onClick={() =>
              setView((current) => (current === "history" ? "chat" : "history"))
            }
            tooltip="Conversation history"
          >
            <HistoryIcon aria-hidden className="size-4.5" />
          </TooltipIconButton>
          <TooltipIconButton
            onClick={copyThreadAsMarkdown}
            tooltip="Copy as Markdown"
          >
            <ClipboardCopyIcon aria-hidden className="size-4.5" />
          </TooltipIconButton>
          <TooltipIconButton
            // Renders an <a>, so opt out of Base UI's native-button contract.
            nativeButton={false}
            render={<Link href="/settings/ai" />}
            tooltip="AI assistant settings"
          >
            <Settings2Icon aria-hidden className="size-4.5" />
          </TooltipIconButton>
          <TooltipIconButton onClick={() => setOpen(false)} tooltip="Close">
            <XIcon aria-hidden className="size-5" />
          </TooltipIconButton>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <div className={view === "history" ? "hidden" : "h-full"}>
          <AiRuntimeProvider
            initialMessages={session.initialMessages}
            key={session.epoch}
          >
            <ThreadExportBridge getterRef={exportMessagesRef} />
            <ChatPanel initialFeedback={session.initialFeedback} />
          </AiRuntimeProvider>
        </div>
        {view === "history" ? (
          <ThreadHistory
            activeThreadId={threadId}
            onDeleted={handleThreadDeleted}
            onSelect={resumeThread}
          />
        ) : null}
      </div>
    </aside>
  );
}
