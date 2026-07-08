"use client";

import {
  ActionBarPrimitive,
  AssistantIf,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type ReasoningMessagePartProps,
  ThreadPrimitive,
  type ToolCallMessagePartProps,
  useAttachment,
  useComposerRuntime,
  useMessage,
  useMessageRuntime,
  useThread,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FileTextIcon,
  HandshakeIcon,
  Loader2Icon,
  MicIcon,
  PaperclipIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TriangleAlertIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { useComposerMenus } from "@/components/ai/composer-menus";
import { DataPartsRenderer } from "@/components/ai/data-parts-renderer";
import { MarkdownText } from "@/components/ai/markdown-text";
import { TooltipIconButton } from "@/components/ai/tooltip-icon-button";
import { VoiceInputButton } from "@/components/ai/voice-input-button";
import {
  suggestionsForContext,
  type WelcomeEntity,
} from "@/components/ai/welcome-suggestions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// One chip serves both the composer (with a remove control) and the sent
// message bubble (read-only), reading its attachment from assistant-ui's
// attachment context. Images preview through the private /api/chat/attachments
// route; everything else shows a file icon.
function AttachmentChip() {
  const attachment = useAttachment();
  const isImage = attachment.contentType.startsWith("image/");
  const inComposer = attachment.source !== "message";
  const thumbnailSrc = `/api/chat/attachments/${attachment.id}`;

  const thumbnail = (
    <Avatar>
      {isImage ? <AvatarImage alt="" src={thumbnailSrc} /> : null}
      <AvatarFallback>
        <FileTextIcon aria-hidden className="size-4" />
      </AvatarFallback>
    </Avatar>
  );

  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-background py-1 pr-1 pl-1 text-foreground text-xs">
      {isImage ? (
        <Dialog>
          <DialogTrigger
            aria-label={`Preview ${attachment.name}`}
            className="rounded-full transition-opacity hover:opacity-75"
          >
            {thumbnail}
          </DialogTrigger>
          <DialogContent className="p-2 sm:max-w-2xl">
            <DialogTitle className="sr-only">{attachment.name}</DialogTitle>
            {/* biome-ignore lint/performance/noImgElement: private R2 route, not a static asset for next/image */}
            <img
              alt=""
              className="mx-auto max-h-[70vh] w-auto rounded-md object-contain"
              height={800}
              src={thumbnailSrc}
              width={800}
            />
          </DialogContent>
        </Dialog>
      ) : (
        thumbnail
      )}
      <span className="max-w-32 truncate">{attachment.name}</span>
      {inComposer ? (
        <AttachmentPrimitive.Remove asChild>
          <Button
            aria-label={`Remove ${attachment.name}`}
            className="size-6"
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden className="size-3.5" />
          </Button>
        </AttachmentPrimitive.Remove>
      ) : null}
    </div>
  );
}

// Stable reference so assistant-ui's memoised attachment list does not
// re-render on every parent render.
const ATTACHMENT_COMPONENTS = { Attachment: AttachmentChip };

// Rounded suggestion chip shared by the welcome screen and the follow-up
// row so both read as the same affordance. The chip stays a single-line pill
// with a uniform max width and truncates rather than wrapping into a tall
// blob; `label` shows a short version while `prompt` is what gets sent. When a
// `tooltip` is given (the full prompt), hovering reveals it.
function SuggestionChip({
  prompt,
  label,
  tooltip,
}: {
  prompt: string;
  label?: string;
  tooltip?: string;
}) {
  const chip = (
    <ThreadPrimitive.Suggestion
      asChild
      autoSend
      method="replace"
      prompt={prompt}
    >
      <Button
        className="h-10 max-w-[15rem] shrink-0 rounded-full px-4"
        type="button"
        variant="outline"
      >
        <span className="min-w-0 truncate">{label ?? prompt}</span>
      </Button>
    </ThreadPrimitive.Suggestion>
  );

  if (!tooltip) {
    return chip;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function ThreadWelcome() {
  const { entity } = useAiAssistant();
  const pathname = usePathname();
  const welcomeEntity: WelcomeEntity | null = entity?.label
    ? { label: entity.label, type: entity.dealId ? "deal" : "contact" }
    : null;
  const suggestions = suggestionsForContext(pathname, welcomeEntity);

  return (
    <ThreadPrimitive.Empty>
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-blu/10">
          <SparklesIcon aria-hidden className="size-5 text-blu" />
        </span>
        <div>
          <h2 className="font-heading font-semibold text-base">
            Blu assistant
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Ask about the pipeline, summarise a client, or draft a follow-up.
          </p>
        </div>
        <div className="mt-2 flex w-full gap-2 overflow-x-auto pb-1">
          {suggestions.map((suggestion) => (
            <SuggestionChip
              key={suggestion.prompt}
              label={suggestion.display}
              prompt={suggestion.prompt}
              tooltip={suggestion.prompt}
            />
          ))}
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
}

// Server-derived follow-up prompts for the finished turn, surfaced by the
// suggestion adapter (see ai-runtime-provider.tsx). Cleared automatically
// when the next run starts.
function FollowUpSuggestions() {
  const suggestions = useThread((thread) => thread.suggestions);
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <div className="flex w-full gap-2 overflow-x-auto pb-1">
      {suggestions.map((suggestion) => (
        <SuggestionChip
          key={suggestion.prompt}
          prompt={suggestion.prompt}
          tooltip={suggestion.prompt}
        />
      ))}
    </div>
  );
}

// The plain text of a message's content parts, for prefilling the edit box.
const selectMessageText = (message: {
  content: readonly { type: string }[];
}): string =>
  message.content
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => part.text)
    .join("\n");

// Edit affordance for the LAST user message only, and only while nothing is
// running and no write plan awaits review (an edited resubmit replaces the
// thread's tail server-side, which must never race a pending confirmation).
// Same hover/touch visibility treatment as the assistant action bar.
function EditMessageButton({ onBeginEdit }: { onBeginEdit: () => void }) {
  const { pendingConfirmation } = useAiAssistant();
  const messageId = useMessage((message) => message.id);
  const isRunning = useThread((thread) => thread.isRunning);
  const isLastUserMessage = useThread((thread) => {
    for (let index = thread.messages.length - 1; index >= 0; index--) {
      const message = thread.messages[index];
      if (message?.role === "user") {
        return message.id === messageId;
      }
    }
    return false;
  });

  if (!isLastUserMessage || isRunning || pendingConfirmation) {
    return null;
  }

  return (
    <div className="-my-2 flex justify-end transition-opacity group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
      <Button
        aria-label="Edit message"
        className="size-11 rounded-md text-muted-foreground"
        onClick={onBeginEdit}
        size="icon"
        type="button"
        variant="ghost"
      >
        <PencilIcon aria-hidden className="size-3.5" />
      </Button>
    </div>
  );
}

// Inline editor that swaps in for the bubble. Send goes through the
// message's edit composer with runConfig.custom.editedMessage, so the
// runtime replaces the tail locally while the adapter tells the server to
// replace the persisted turn (POST /api/chat editedMessage). A 409 (the span
// after this turn executed writes) surfaces the server's wording exactly
// like the regenerate path.
function UserMessageEditor({
  initialText,
  onClose,
}: {
  initialText: string;
  onClose: () => void;
}) {
  const messageRuntime = useMessageRuntime();
  const [draft, setDraft] = useState(initialText);
  const fieldId = useId();
  const trimmed = draft.trim();

  const send = () => {
    if (!trimmed) {
      return;
    }
    if (trimmed === initialText.trim()) {
      onClose();
      return;
    }
    const composer = messageRuntime.composer;
    composer.beginEdit();
    composer.setText(trimmed);
    composer.setRunConfig({ custom: { editedMessage: trimmed } });
    composer.send();
    onClose();
  };

  return (
    <div className="w-full rounded-2xl border bg-muted/30 p-2">
      <Label className="sr-only" htmlFor={fieldId}>
        Edit your message
      </Label>
      <Textarea
        autoFocus
        className="bg-background"
        id={fieldId}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        rows={3}
        value={draft}
      />
      <div className="mt-2 flex justify-end gap-1.5">
        <Button
          className="min-h-11 px-4"
          onClick={onClose}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          className="min-h-11 px-4"
          disabled={!trimmed}
          onClick={send}
          type="button"
        >
          Send
        </Button>
      </div>
    </div>
  );
}

function UserMessage() {
  const [editing, setEditing] = useState(false);
  const text = useMessage(selectMessageText);

  return (
    <MessagePrimitive.Root className="fade-in slide-in-from-bottom-1 group flex animate-in flex-col items-end gap-1.5 py-1.5 duration-200">
      <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5 empty:hidden">
        <MessagePrimitive.Attachments components={ATTACHMENT_COMPONENTS} />
      </div>
      {editing ? (
        <UserMessageEditor
          initialText={text}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blu px-3.5 py-2 text-sm text-white empty:hidden">
            <MessagePrimitive.Parts />
          </div>
          <EditMessageButton onBeginEdit={() => setEditing(true)} />
        </>
      )}
    </MessagePrimitive.Root>
  );
}

// Live activity pill for one tool call: spinner while the tool runs, a tick
// once done, warning styling if the tool reported an error. The label is the
// human line the server sent on tool_start.
function ToolActivityChip(part: ToolCallMessagePartProps) {
  const running = part.result === undefined;
  const isError = part.isError === true;
  const label =
    (part.artifact as { label?: string } | undefined)?.label ?? part.toolName;

  return (
    <span
      className={cn(
        "my-1 flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        isError
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
      )}
      role="status"
    >
      {running ? (
        <Loader2Icon aria-hidden className="size-3.5 shrink-0 animate-spin" />
      ) : null}
      {!running && isError ? (
        <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
      ) : null}
      {running || isError ? null : (
        <CheckIcon aria-hidden className="size-3.5 shrink-0 text-success" />
      )}
      <span className="truncate">{label}</span>
      {running ? <span className="sr-only">, in progress</span> : null}
    </span>
  );
}

// Collapsible extended-thinking summary. Open while the part is streaming
// (assistant-ui marks a part running only while it is the last part of a
// running message, so it auto-collapses when the answer text starts) unless
// the user has toggled it, in which case their choice wins.
function ReasoningSection(part: ReasoningMessagePartProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const running = part.status.type === "running";
  const open = userOpen ?? running;

  return (
    <Collapsible
      className="my-1.5 w-full rounded-lg border bg-muted/30"
      onOpenChange={(next) => setUserOpen(next)}
      open={open}
    >
      <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-muted-foreground text-xs">
        <BrainIcon aria-hidden className="size-3.5 shrink-0" />
        Reasoning
        {running ? (
          <Loader2Icon aria-hidden className="size-3 animate-spin" />
        ) : null}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "ml-auto size-4 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="whitespace-pre-wrap px-3 pb-2.5 text-muted-foreground text-xs leading-relaxed">
        {part.text}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Stable component map for MessagePrimitive.Parts (a fresh object each render
// would remount every part).
const ASSISTANT_PARTS_COMPONENTS = {
  Reasoning: ReasoningSection,
  Text: MarkdownText,
  tools: { Fallback: ToolActivityChip },
};

// Re-runs the last exchange. Only offered on the latest assistant message,
// and never on turns that proposed a write (a confirmed change must not be
// silently re-runnable; deliberate policy).
function RegenerateButton() {
  const messageRuntime = useMessageRuntime();
  const { pendingConfirmation } = useAiAssistant();
  const isLast = useMessage((message) => message.isLast);
  const hasConfirmation = useMessage(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some(
        (part) => part.type === "data" && part.name === "confirmation_request"
      )
  );

  if (!isLast || hasConfirmation || pendingConfirmation) {
    return null;
  }

  return (
    <Button
      aria-label="Regenerate response"
      className="size-6 rounded-md text-muted-foreground"
      onClick={() =>
        messageRuntime.reload({ runConfig: { custom: { regenerate: true } } })
      }
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <RefreshCwIcon aria-hidden className="size-3.5" />
    </Button>
  );
}

type FeedbackRating = "up" | "down";
type FeedbackCategory = "inaccurate" | "not_relevant" | "incomplete";

const FEEDBACK_CATEGORIES: { label: string; value: FeedbackCategory }[] = [
  { label: "Inaccurate", value: "inaccurate" },
  { label: "Not relevant", value: "not_relevant" },
  { label: "Incomplete", value: "incomplete" },
];

// The current user's saved ratings by server message id, loaded with the
// transcript on thread resume (chat-launcher.tsx) so thumbs re-paint.
const EMPTY_THREAD_FEEDBACK: Record<string, FeedbackRating> = {};
const ThreadFeedbackContext = createContext<Record<string, FeedbackRating>>(
  EMPTY_THREAD_FEEDBACK
);

// A repeat POST with a new rating updates in place server-side; "clear"
// deletes the row. Returns success so callers can revert optimistic state.
const postFeedback = async (body: {
  category?: FeedbackCategory;
  comment?: string;
  messageId: string;
  rating: FeedbackRating | "clear";
}): Promise<boolean> => {
  try {
    const response = await fetch("/api/chat/feedback", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
};

// The persisted assistant message id, carried as an invisible message_meta
// data part: pushed by the runtime adapter from the stream's `done` payload
// on live turns, and by chat-launcher's resume mapping from the row id.
const selectServerMessageId = (message: {
  content: readonly { type: string }[];
}): string | null => {
  for (const part of message.content) {
    if (part.type === "data") {
      const dataPart = part as { data?: unknown; name?: string };
      if (dataPart.name === "message_meta") {
        const messageId = (dataPart.data as { messageId?: unknown } | null)
          ?.messageId;
        return typeof messageId === "string" ? messageId : null;
      }
    }
  }
  return null;
};

// Follow-up detail form shown after a thumbs-down. The down-rating itself is
// already saved; category and comment ride a second POST and are optional.
// `send` goes through the parent's per-message queue so this POST can never
// overtake (and be overwritten by) the initial bare down-rating POST.
function FeedbackDetails({
  onClose,
  send,
}: {
  onClose: () => void;
  send: (details: {
    category?: FeedbackCategory;
    comment?: string;
  }) => Promise<boolean>;
}) {
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [comment, setComment] = useState("");
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const commentFieldId = useId();

  const sendDetails = async () => {
    setSending(true);
    setFailed(false);
    const ok = await send({
      category: category ?? undefined,
      comment: comment.trim() || undefined,
    });
    setSending(false);
    if (ok) {
      onClose();
      return;
    }
    setFailed(true);
  };

  return (
    <div
      className="my-1 w-full rounded-lg border bg-muted/30 p-3"
      data-feedback-panel
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-xs">
          What was wrong? Both fields are optional.
        </p>
        <Button
          aria-label="Close feedback form"
          className="-my-1.5 -mr-1.5 size-11 rounded-md text-muted-foreground"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {FEEDBACK_CATEGORIES.map((option) => {
          const active = category === option.value;
          return (
            <Button
              aria-pressed={active}
              className={cn(
                "min-h-11 rounded-full px-4",
                active && "border-blu bg-blu/10"
              )}
              key={option.value}
              onClick={() => setCategory(active ? null : option.value)}
              type="button"
              variant="outline"
            >
              {active ? <CheckIcon aria-hidden className="size-3.5" /> : null}
              {option.label}
            </Button>
          );
        })}
      </div>
      <Label className="sr-only" htmlFor={commentFieldId}>
        Feedback comment
      </Label>
      <Textarea
        className="mt-2 bg-background"
        id={commentFieldId}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Add a comment (optional)"
        rows={2}
        value={comment}
      />
      {failed ? (
        <p className="mt-1.5 text-destructive text-xs" role="alert">
          Could not send the details. Please try again.
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <Button
          className="min-h-11 px-4"
          disabled={sending || (!category && comment.trim().length === 0)}
          onClick={sendDetails}
          type="button"
          variant="secondary"
        >
          {sending ? (
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
          ) : null}
          Send
        </Button>
      </div>
    </div>
  );
}

// Thumbs up/down for a completed assistant message. Optimistic: the rating
// paints immediately and reverts if the POST fails. Tapping the active thumb
// clears it; thumbs-down also opens the inline detail form.
function MessageFeedback() {
  const initialFeedback = useContext(ThreadFeedbackContext);
  const messageId = useMessage(selectServerMessageId);
  const [rating, setRating] = useState<FeedbackRating | null>(() =>
    messageId ? (initialFeedback[messageId] ?? null) : null
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  // POSTs for this message run strictly in order (a details POST must never
  // overtake the bare rating POST it follows), and only the newest request
  // may revert optimistic state after a failure.
  const postQueue = useRef<Promise<unknown>>(Promise.resolve());
  const requestSeq = useRef(0);

  if (!messageId) {
    return null;
  }

  const enqueuePost = (body: {
    category?: FeedbackCategory;
    comment?: string;
    rating: FeedbackRating | "clear";
  }): Promise<boolean> => {
    const request = postQueue.current.then(() =>
      postFeedback({ messageId, ...body })
    );
    postQueue.current = request.then(
      () => undefined,
      () => undefined
    );
    return request;
  };

  const applyRating = async (
    next: FeedbackRating | null,
    request: FeedbackRating | "clear"
  ) => {
    const previous = rating;
    const seq = ++requestSeq.current;
    setRating(next);
    const ok = await enqueuePost({ rating: request });
    if (!ok && requestSeq.current === seq) {
      setRating(previous);
    }
  };

  const toggleUp = async () => {
    setDetailsOpen(false);
    await (rating === "up"
      ? applyRating(null, "clear")
      : applyRating("up", "up"));
  };

  const toggleDown = async () => {
    if (rating === "down") {
      setDetailsOpen(false);
      await applyRating(null, "clear");
      return;
    }
    setDetailsOpen(true);
    await applyRating("down", "down");
  };

  return (
    <>
      <Button
        aria-label="Good response"
        aria-pressed={rating === "up"}
        className={cn(
          "size-11 rounded-md text-muted-foreground",
          rating === "up" && "bg-muted text-blu"
        )}
        onClick={toggleUp}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ThumbsUpIcon
          aria-hidden
          className={cn("size-3.5", rating === "up" && "fill-current")}
        />
      </Button>
      <Button
        aria-label="Poor response"
        aria-pressed={rating === "down"}
        className={cn(
          "size-11 rounded-md text-muted-foreground",
          rating === "down" && "bg-muted text-blu"
        )}
        onClick={toggleDown}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ThumbsDownIcon
          aria-hidden
          className={cn("size-3.5", rating === "down" && "fill-current")}
        />
      </Button>
      {detailsOpen && rating === "down" ? (
        <FeedbackDetails
          onClose={() => setDetailsOpen(false)}
          send={(details) => enqueuePost({ ...details, rating: "down" })}
        />
      ) : null}
    </>
  );
}

// Hover devices get the tidy fade-in bar; touch devices (no hover) keep it
// always visible, since there is nothing to hover with a work glove. The
// has-[] guard pins it visible while the feedback detail form is open.
function AssistantActionBar() {
  return (
    <ActionBarPrimitive.Root
      className="-mb-1 flex flex-wrap items-center transition-opacity group-focus-within:opacity-100 has-[[data-feedback-panel]]:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
      hideWhenRunning
    >
      <ActionBarPrimitive.Copy asChild>
        <Button
          aria-label="Copy message"
          className="size-6 rounded-md text-muted-foreground"
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <AssistantIf condition={({ message }) => message.isCopied}>
            <CheckIcon aria-hidden className="size-3.5" />
          </AssistantIf>
          <AssistantIf condition={({ message }) => !message.isCopied}>
            <CopyIcon aria-hidden className="size-3.5" />
          </AssistantIf>
        </Button>
      </ActionBarPrimitive.Copy>
      <RegenerateButton />
      <MessageFeedback />
    </ActionBarPrimitive.Root>
  );
}

// Shown only while the run is "running" with nothing streamed yet (derived
// from assistant-ui's own message status, not a placeholder string standing
// in for content; see ai-runtime-provider.tsx's snapshotOf).
function ThinkingIndicator() {
  const isThinking = useMessage(
    (message) =>
      message.status?.type === "running" && message.content.length === 0
  );
  if (!isThinking) {
    return null;
  }
  return (
    <span
      aria-label="Thinking"
      className="flex items-center gap-1 py-1"
      role="status"
    >
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
    </span>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="fade-in slide-in-from-bottom-1 group animate-in py-1.5 duration-200">
      <div className="text-foreground text-sm leading-relaxed">
        <ThinkingIndicator />
        <MessagePrimitive.Parts components={ASSISTANT_PARTS_COMPONENTS} />
        <DataPartsRenderer />
      </div>
      <AssistantActionBar />
    </MessagePrimitive.Root>
  );
}

// assistant-ui only inserts an attachment into the runtime once the
// adapter's add() Promise resolves, so there is no "pending" attachment to
// read a progress status from (verified against the library's composer
// core). To give an honest in-flight signal we call composerRuntime's
// addAttachment ourselves from both entry points (file picker and drag
// drop) instead of the ComposerPrimitive.AddAttachment/AttachmentDropzone
// defaults, and track how many uploads are outstanding locally.
function useAttachmentUpload() {
  const composerRuntime = useComposerRuntime();
  const [uploading, setUploading] = useState(0);

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      for (const file of files) {
        setUploading((count) => count + 1);
        composerRuntime
          .addAttachment(file)
          // Rejections are already surfaced via the composer's
          // attachmentError line; swallowing here avoids an unhandled
          // rejection per rejected file.
          .catch(() => {
            // handled by the attachment adapter's onError
          })
          .finally(() => {
            setUploading((count) => count - 1);
          });
      }
    },
    [composerRuntime]
  );

  return { addFiles, uploading: uploading > 0 };
}

function AddAttachmentButton({
  onSelect,
}: {
  onSelect: (files: FileList) => void;
}) {
  const composerRuntime = useComposerRuntime();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        accept={composerRuntime.getState().attachmentAccept}
        aria-hidden
        className="sr-only"
        multiple
        onChange={(event) => {
          if (event.target.files) {
            onSelect(event.target.files);
          }
          event.target.value = "";
        }}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      <TooltipIconButton
        className="size-11"
        onClick={() => inputRef.current?.click()}
        tooltip="Attach an image or PDF"
      >
        <PaperclipIcon aria-hidden className="size-5" />
      </TooltipIconButton>
    </>
  );
}

// Chips for transcribed voice notes whose audio will ride the next send as
// an attachment (ai-context's voiceAttachmentIds, consumed by the runtime
// adapter). Removing one drops the audio; the list clears after send.
function VoiceNoteChips() {
  const { removeVoiceAttachment, voiceAttachmentIds } = useAiAssistant();
  if (voiceAttachmentIds.length === 0) {
    return null;
  }
  return (
    <>
      {voiceAttachmentIds.map((attachmentId) => (
        <span
          className="flex items-center gap-1.5 rounded-full border bg-muted py-1 pr-1 pl-3 text-foreground text-xs"
          key={attachmentId}
        >
          <MicIcon aria-hidden className="size-3.5 shrink-0 text-blu" />
          Voice note attached
          <Button
            aria-label="Remove voice note"
            className="-my-3 -mr-1 size-11 rounded-full text-muted-foreground"
            onClick={() => removeVoiceAttachment(attachmentId)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden className="size-3.5" />
          </Button>
        </span>
      ))}
    </>
  );
}

// Copilot-style context chip: shows which deal or contact the assistant is
// drawing on (registered by the page via AiEntityBeacon and already sent to
// /api/chat as pageContext; this makes that invisible context visible).
function ContextChip() {
  const { entity } = useAiAssistant();
  if (!entity?.label) {
    return null;
  }
  const Icon = entity.dealId ? HandshakeIcon : UserIcon;
  return (
    <p className="flex w-fit max-w-full items-center gap-1.5 rounded-full border bg-muted px-3 py-1.5 text-xs">
      <Icon aria-hidden className="size-3.5 shrink-0 text-blu" />
      <span className="truncate">
        <span className="sr-only">The assistant is using </span>
        {entity.label}
      </span>
    </p>
  );
}

// Consumes text staged by an "Ask AI" entry point into the input. Never
// auto-sends; the user reviews and hits send themselves.
function useComposerPrefill(
  inputRef: React.RefObject<HTMLTextAreaElement | null>
) {
  const { clearComposerPrefill, composerPrefill } = useAiAssistant();
  const composerRuntime = useComposerRuntime();

  useEffect(() => {
    if (!composerPrefill) {
      return;
    }
    composerRuntime.setText(composerPrefill);
    inputRef.current?.focus();
    clearComposerPrefill();
  }, [clearComposerPrefill, composerPrefill, composerRuntime, inputRef]);
}

function Composer() {
  const { attachmentError } = useAiAssistant();
  const { addFiles, uploading } = useAttachmentUpload();
  const [isDragging, setIsDragging] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useComposerPrefill(inputRef);
  const { inputProps, menu } = useComposerMenus(inputRef);

  return (
    <div className="flex w-full flex-col gap-2">
      <ContextChip />
      <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
        <ComposerPrimitive.Attachments components={ATTACHMENT_COMPONENTS} />
        <VoiceNoteChips />
        {uploading ? (
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <Loader2Icon aria-hidden className="size-3.5 animate-spin" />
            Uploading…
          </span>
        ) : null}
      </div>
      {attachmentError ? (
        <p className="text-destructive text-xs" role="alert">
          {attachmentError}
        </p>
      ) : null}
      {voiceError ? (
        <p className="text-destructive text-xs" role="alert">
          {voiceError}
        </p>
      ) : null}
      {menu}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop dropzone wrapping interactive composer children, matching assistant-ui's own ComposerPrimitive.AttachmentDropzone (an unlabelled div with the same handlers) */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: see above */}
      <div
        className={cn(
          "rounded-2xl border transition-colors has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20",
          isDragging && "border-blu border-dashed bg-blu/5"
        )}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) {
            return;
          }
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <ComposerPrimitive.Root className="flex w-full items-end gap-1.5 rounded-2xl bg-muted/30 p-2">
          <AddAttachmentButton onSelect={addFiles} />
          <VoiceInputButton inputRef={inputRef} onError={setVoiceError} />
          <ComposerPrimitive.Input
            aria-label="Message the assistant"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Ask the Blu assistant…"
            ref={inputRef}
            rows={1}
            {...inputProps}
          />
          <AssistantIf condition={({ thread }) => !thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <Button
                aria-label="Send message"
                className="size-11 shrink-0 rounded-full"
                size="icon"
                type="submit"
              >
                <ArrowUpIcon aria-hidden className="size-5" />
              </Button>
            </ComposerPrimitive.Send>
          </AssistantIf>
          <AssistantIf condition={({ thread }) => thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <Button
                aria-label="Stop generating"
                className="size-11 shrink-0 rounded-full"
                size="icon"
                type="button"
                variant="secondary"
              >
                <SquareIcon aria-hidden className="size-4 fill-current" />
              </Button>
            </ComposerPrimitive.Cancel>
          </AssistantIf>
        </ComposerPrimitive.Root>
      </div>
    </div>
  );
}

export function ChatPanel({
  initialFeedback = EMPTY_THREAD_FEEDBACK,
}: {
  // Saved thumbs ratings by server message id, from the thread GET on resume.
  initialFeedback?: Record<string, FeedbackRating>;
}) {
  const { offline } = useAiAssistant();

  return (
    <ThreadFeedbackContext.Provider value={initialFeedback}>
      <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          <ThreadPrimitive.Viewport className="h-full overflow-y-auto px-3 pt-3">
            <ThreadWelcome />
            <ThreadPrimitive.Messages
              components={{ AssistantMessage, UserMessage }}
            />
            <div aria-hidden className="h-3" />
          </ThreadPrimitive.Viewport>
          <ThreadPrimitive.ScrollToBottom asChild>
            <Button
              aria-label="Scroll to latest message"
              className="absolute right-3 bottom-3 size-9 rounded-full shadow-md disabled:hidden"
              size="icon"
              type="button"
              variant="secondary"
            >
              <ArrowDownIcon aria-hidden className="size-4" />
            </Button>
          </ThreadPrimitive.ScrollToBottom>
        </div>
        <div className="border-t p-3">
          {offline ? (
            <p
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-300"
              role="status"
            >
              The assistant is offline. The rest of Blu CRM keeps working.
            </p>
          ) : null}
          <FollowUpSuggestions />
          <Composer />
        </div>
      </ThreadPrimitive.Root>
    </ThreadFeedbackContext.Provider>
  );
}
