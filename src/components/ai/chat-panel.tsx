"use client";

import {
  AssistantIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import {
  ArrowUpIcon,
  FileTextIcon,
  Loader2Icon,
  PaperclipIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import {
  type UploadedAttachment,
  useAiAssistant,
} from "@/components/ai/ai-context";
import { DataPartsRenderer } from "@/components/ai/data-parts-renderer";
import { MarkdownText } from "@/components/ai/markdown-text";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "Which deals have gone quiet for over a week?",
  "What's closing in the next 14 days?",
  "What's in the inbox?",
];

// Mirrors the server's AI_READABLE_TYPES / MAX_ATTACHMENT_BYTES so the user
// gets immediate feedback; the upload route re-validates authoritatively.
const ACCEPTED_UPLOAD_TYPES = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_STAGED_ATTACHMENTS = 5;

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: UploadedAttachment;
  onRemove: () => void;
}) {
  const isImage = attachment.contentType.startsWith("image/");
  return (
    <span className="flex items-center gap-1.5 rounded-lg border bg-background py-1 pr-1 pl-2 text-xs">
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
      <span className="max-w-32 truncate">{attachment.fileName}</span>
      <Button
        aria-label={`Remove ${attachment.fileName}`}
        className="size-6"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <XIcon aria-hidden className="size-3.5" />
      </Button>
    </span>
  );
}

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
    <MessagePrimitive.Root className="flex justify-end py-1.5">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blu px-3.5 py-2 text-sm text-white">
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
  const { pendingAttachments, setPendingAttachments, threadId } =
    useAiAssistant();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadOne = async (file: File): Promise<UploadedAttachment | null> => {
    const form = new FormData();
    form.append("file", file);
    if (threadId) {
      form.append("threadId", threadId);
    }
    const response = await fetch("/api/chat/attachments", {
      body: form,
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setUploadError(payload.error ?? "That file could not be uploaded.");
      return null;
    }
    return (await response.json()) as UploadedAttachment;
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) {
      return;
    }
    setUploadError(null);

    const room = MAX_STAGED_ATTACHMENTS - pendingAttachments.length;
    const accepted: File[] = [];
    for (const file of selected.slice(0, Math.max(room, 0))) {
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadError("Files must be 10 MB or smaller.");
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) {
      return;
    }

    setUploadingCount((count) => count + accepted.length);
    const uploaded = await Promise.all(accepted.map(uploadOne));
    setUploadingCount((count) => count - accepted.length);

    const ready = uploaded.filter(
      (item): item is UploadedAttachment => item !== null
    );
    if (ready.length > 0) {
      setPendingAttachments([...pendingAttachments, ...ready]);
    }
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments(
      pendingAttachments.filter((attachment) => attachment.id !== id)
    );
  };

  const atLimit = pendingAttachments.length >= MAX_STAGED_ATTACHMENTS;

  return (
    <div className="flex w-full flex-col gap-2">
      {pendingAttachments.length > 0 || uploadingCount > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {pendingAttachments.map((attachment) => (
            <AttachmentChip
              attachment={attachment}
              key={attachment.id}
              onRemove={() => removeAttachment(attachment.id)}
            />
          ))}
          {uploadingCount > 0 ? (
            <span
              className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1 text-muted-foreground text-xs"
              role="status"
            >
              <Loader2Icon aria-hidden className="size-3.5 animate-spin" />
              Uploading…
            </span>
          ) : null}
        </div>
      ) : null}
      {uploadError ? (
        <p className="text-destructive text-xs" role="alert">
          {uploadError}
        </p>
      ) : null}
      <ComposerPrimitive.Root className="flex w-full items-end gap-2 rounded-2xl border bg-muted/30 p-2 transition-shadow has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/20">
        <input
          accept={ACCEPTED_UPLOAD_TYPES}
          aria-hidden
          className="hidden"
          multiple
          onChange={handleFiles}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />
        <Button
          aria-label="Attach an image or PDF"
          className="size-11 shrink-0 rounded-full"
          disabled={atLimit}
          onClick={() => fileInputRef.current?.click()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <PaperclipIcon aria-hidden className="size-5" />
        </Button>
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
