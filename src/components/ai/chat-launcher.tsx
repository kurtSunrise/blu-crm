"use client";

import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  HistoryIcon,
  Settings2Icon,
  SparklesIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { useState } from "react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { AiRuntimeProvider } from "@/components/ai/ai-runtime-provider";
import { ChatPanel } from "@/components/ai/chat-panel";
import type { ResumedConfirmationStatus } from "@/components/ai/confirmation-card";
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

interface ChatSession {
  epoch: number;
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
const toDataParts = (parts: ResumedPart[]): ResumedDataPart[] => {
  const dataParts: ResumedDataPart[] = [];
  const confirmations: Extract<ResumedPart, { type: "confirmation" }>[] = [];
  for (const part of parts) {
    if (part.type === "artifact") {
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
    return dataParts;
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
  return dataParts;
};

const toThreadMessages = (messages: ResumedMessage[]): ThreadMessageLike[] =>
  messages.map((message) => {
    const dataParts = toDataParts(message.parts ?? []);
    const content: ({ type: "text"; text: string } | ResumedDataPart)[] =
      message.text
        ? [{ text: message.text, type: "text" }, ...dataParts]
        : dataParts;
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

// The assistant surface itself. Stays mounted while closed (hidden via CSS)
// so the conversation survives open/close. Mobile: full-screen overlay.
// Desktop: fixed 400px right sidebar; AppShell pads the main content.
// The runtime is keyed by a session epoch: "new chat" and resuming a thread
// from history each remount it (a LocalRuntime's messages are fixed at
// creation), while toggling the history view only hides the live chat.
export function AiAssistantDock() {
  const {
    decisionRef,
    open,
    setOpen,
    setPendingConfirmation,
    setThreadId,
    threadId,
  } = useAiAssistant();
  const [view, setView] = useState<"chat" | "history">("chat");
  const [session, setSession] = useState<ChatSession>({
    epoch: 0,
    initialMessages: [],
  });

  const switchSession = (
    nextThreadId: string | null,
    initialMessages: ThreadMessageLike[]
  ) => {
    setThreadId(nextThreadId);
    setPendingConfirmation(null);
    decisionRef.current = null;
    setSession((current) => ({ epoch: current.epoch + 1, initialMessages }));
    setView("chat");
  };

  const startNewChat = () => switchSession(null, []);

  const resumeThread = async (resumeId: string) => {
    if (resumeId === threadId) {
      setView("chat");
      return;
    }
    const response = await fetch(`/api/chat/threads/${resumeId}`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as {
      messages: ResumedMessage[];
      thread?: ResumedThread;
    };
    switchSession(resumeId, toThreadMessages(payload.messages));
    // A thread paused on a write plan resumes actionable: re-seed the pending
    // confirmation so its card's buttons work again.
    const pendingToolUses = payload.thread?.pendingToolUses;
    if (pendingToolUses && pendingToolUses.length > 0) {
      setPendingConfirmation({ items: pendingToolUses });
    }
  };

  const handleThreadDeleted = (deletedThreadId: string) => {
    if (deletedThreadId === threadId) {
      startNewChat();
    }
  };

  return (
    <aside
      aria-label="Blu assistant"
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-background transition-transform duration-200 ease-out md:left-auto md:z-30 md:w-[400px] md:border-l",
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
            <ChatPanel />
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
