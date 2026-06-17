"use client";

import {
  AssistantIf,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAttachment,
} from "@assistant-ui/react";
import {
  ArrowUpIcon,
  FileTextIcon,
  PaperclipIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useAiAssistant } from "@/components/ai/ai-context";
import { DataPartsRenderer } from "@/components/ai/data-parts-renderer";
import { MarkdownText } from "@/components/ai/markdown-text";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "Which deals have gone quiet for over a week?",
  "What's closing in the next 14 days?",
  "What's in the inbox?",
];

// One chip serves both the composer (with a remove control) and the sent
// message bubble (read-only), reading its attachment from assistant-ui's
// attachment context. Images preview through the private /api/chat/attachments
// route; everything else shows a file icon.
function AttachmentChip() {
  const attachment = useAttachment();
  const isImage = attachment.contentType.startsWith("image/");
  const inComposer = attachment.source !== "message";
  return (
    <span className="flex items-center gap-1.5 rounded-lg border bg-background py-1 pr-1 pl-2 text-foreground text-xs">
      {isImage ? (
        // biome-ignore lint/performance/noImgElement: private R2 route, not a static asset for next/image
        <img
          alt=""
          className="rounded object-cover"
          height={24}
          src={`/api/chat/attachments/${attachment.id}`}
          width={24}
        />
      ) : (
        <FileTextIcon aria-hidden className="size-4 text-muted-foreground" />
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
    </span>
  );
}

// Stable reference so assistant-ui's memoised attachment list does not
// re-render on every parent render.
const ATTACHMENT_COMPONENTS = { Attachment: AttachmentChip };

function ThreadWelcome() {
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
        <div className="mt-2 flex w-full flex-col gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <ThreadPrimitive.Suggestion
              asChild
              autoSend
              key={suggestion}
              method="replace"
              prompt={suggestion}
            >
              <Button
                className="h-auto min-h-10 w-full justify-start whitespace-normal text-left"
                type="button"
                variant="outline"
              >
                {suggestion}
              </Button>
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col items-end gap-1.5 py-1.5">
      <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5 empty:hidden">
        <MessagePrimitive.Attachments components={ATTACHMENT_COMPONENTS} />
      </div>
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blu px-3.5 py-2 text-sm text-white empty:hidden">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="py-1.5">
      <div className="text-foreground text-sm leading-relaxed">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
        <DataPartsRenderer />
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  const { attachmentError } = useAiAssistant();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-1.5 empty:hidden">
        <ComposerPrimitive.Attachments components={ATTACHMENT_COMPONENTS} />
      </div>
      {attachmentError ? (
        <p className="text-destructive text-xs" role="alert">
          {attachmentError}
        </p>
      ) : null}
      <ComposerPrimitive.Root className="flex w-full items-end gap-2 rounded-2xl border bg-muted/30 p-2 transition-shadow has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20">
        <ComposerPrimitive.AddAttachment asChild multiple>
          <Button
            aria-label="Attach an image or PDF"
            className="size-11 shrink-0 rounded-full"
            size="icon"
            type="button"
            variant="ghost"
          >
            <PaperclipIcon aria-hidden className="size-5" />
          </Button>
        </ComposerPrimitive.AddAttachment>
        <ComposerPrimitive.Input
          aria-label="Message the assistant"
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Ask the Blu assistant…"
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
  );
}

export function ChatPanel() {
  const { offline } = useAiAssistant();

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 pt-3">
        <ThreadWelcome />
        <ThreadPrimitive.Messages
          components={{ AssistantMessage, UserMessage }}
        />
        <div aria-hidden className="h-3" />
      </ThreadPrimitive.Viewport>
      <div className="border-t p-3">
        {offline ? (
          <p
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-300"
            role="status"
          >
            The assistant is offline. The rest of Blu CRM keeps working.
          </p>
        ) : null}
        <Composer />
      </div>
    </ThreadPrimitive.Root>
  );
}
