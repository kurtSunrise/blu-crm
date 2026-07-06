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
  PaperclipIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  TriangleAlertIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAiAssistant } from "@/components/ai/ai-context";
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
// row so both read as the same affordance.
function SuggestionChip({ prompt }: { prompt: string }) {
  return (
    <ThreadPrimitive.Suggestion
      asChild
      autoSend
      method="replace"
      prompt={prompt}
    >
      <Button
        className="h-auto min-h-10 max-w-[80%] shrink-0 whitespace-normal rounded-full px-4 py-2 text-left"
        type="button"
        variant="outline"
      >
        {prompt}
      </Button>
    </ThreadPrimitive.Suggestion>
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
            <SuggestionChip key={suggestion} prompt={suggestion} />
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
        <SuggestionChip key={suggestion.prompt} prompt={suggestion.prompt} />
      ))}
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="fade-in slide-in-from-bottom-1 flex animate-in flex-col items-end gap-1.5 py-1.5 duration-200">
      <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5 empty:hidden">
        <MessagePrimitive.Attachments components={ATTACHMENT_COMPONENTS} />
      </div>
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blu px-3.5 py-2 text-sm text-white empty:hidden">
        <MessagePrimitive.Parts />
      </div>
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

function AssistantActionBar() {
  return (
    <ActionBarPrimitive.Root
      className="-mb-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
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
    </ActionBarPrimitive.Root>
  );
}

// Shown only while the run is "running" with nothing streamed yet (derived
// from assistant-ui's own message status, not a placeholder string standing
// in for content — see ai-runtime-provider.tsx's snapshotOf).
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

// Copilot-style context chip: shows which deal or contact the assistant is
// drawing on (registered by the page via AiEntityBeacon and already sent to
// /api/chat as pageContext — this makes that invisible context visible).
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

  return (
    <div className="flex w-full flex-col gap-2">
      <ContextChip />
      <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
        <ComposerPrimitive.Attachments components={ATTACHMENT_COMPONENTS} />
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

export function ChatPanel() {
  const { offline } = useAiAssistant();

  return (
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
  );
}
