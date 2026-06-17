import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";

// Bridges assistant-ui's native composer attachments to Blu's upload route.
// Each file is uploaded to /api/chat/attachments as it is added; the server
// attachment id rides on the attachment's `id`, so the runtime adapter can
// read it back off the sent message and forward it to /api/chat, and the
// message bubble can render a thumbnail from the same id. Mirrors the server's
// AI_READABLE_TYPES and 10 MB cap so the user gets immediate feedback; the
// upload route re-validates authoritatively.

const ACCEPTED_UPLOAD_TYPES = "image/jpeg,image/png,image/webp,application/pdf";
const ACCEPTED_TYPE_SET = new Set(ACCEPTED_UPLOAD_TYPES.split(","));
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface AttachmentAdapterDeps {
  // Read live so a file staged before the thread exists still uploads under
  // the right R2 path once the thread is created.
  getThreadId: () => string | null;
  // Surfaces a human-readable failure in the composer (the call site does not
  // await add(), so a thrown error would otherwise be invisible).
  onError: (message: string | null) => void;
}

interface UploadResponse {
  contentType: string;
  fileName: string;
  id: string;
  sizeBytes: number;
}

const attachmentType = (contentType: string): "image" | "document" =>
  contentType.startsWith("image/") ? "image" : "document";

export const createChatAttachmentAdapter = (
  deps: AttachmentAdapterDeps
): AttachmentAdapter => ({
  accept: ACCEPTED_UPLOAD_TYPES,

  async add({ file }) {
    deps.onError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      const message = "Files must be 10 MB or smaller.";
      deps.onError(message);
      throw new Error(message);
    }
    if (!ACCEPTED_TYPE_SET.has(file.type)) {
      const message =
        "Images (JPG, PNG, WebP) and PDFs only. Convert HEIC first.";
      deps.onError(message);
      throw new Error(message);
    }

    const form = new FormData();
    form.append("file", file);
    const threadId = deps.getThreadId();
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
      const message = payload.error ?? "That file could not be uploaded.";
      deps.onError(message);
      throw new Error(message);
    }
    const uploaded = (await response.json()) as UploadResponse;

    return {
      content: [],
      contentType: uploaded.contentType,
      file,
      id: uploaded.id,
      name: uploaded.fileName,
      status: { reason: "composer-send", type: "requires-action" },
      type: attachmentType(uploaded.contentType),
    } satisfies PendingAttachment;
  },

  remove() {
    // Unsent uploads are reaped when the thread is deleted; nothing to undo
    // here, matching the prior staged-attachment behaviour.
    return Promise.resolve();
  },

  send(attachment) {
    return Promise.resolve({
      ...attachment,
      content: [],
      status: { type: "complete" },
    } satisfies CompleteAttachment);
  },
});
