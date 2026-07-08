import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attachment, chatAttachment } from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";
import { sanitizeFileName } from "@/lib/validation/attachment";

// Bridges uploaded chat attachments and the Anthropic Messages API. A user
// turn persists lightweight `blu_media` references (no base64) in
// chat_message.content; loadThreadMessages rehydrates them into real
// image/document blocks with bytes pulled from R2, so Postgres stays lean and
// the model still sees the file on every replay.

// Persisted in place of base64. Not an Anthropic block type — it is swapped
// out before the history is sent to the model.
export interface BluMediaBlock {
  attachmentId: string;
  contentType: string;
  fileName: string;
  type: "blu_media";
}

const MAX_CHAT_ATTACHMENTS = 5;

// Chunked so a 10 MB file doesn't blow the call stack via a single spread.
const BASE64_CHUNK = 0x80_00;

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + BASE64_CHUNK)
    );
  }
  return btoa(binary);
};

export const isBluMediaBlock = (block: unknown): block is BluMediaBlock =>
  typeof block === "object" &&
  block !== null &&
  (block as { type?: string }).type === "blu_media";

// Voice notes retained by /api/chat/transcribe (FR-7.7) live in
// chat_attachment alongside images and PDFs, but audio must never reach the
// model: the Messages API has no audio block type. Safari's MediaRecorder
// labels mp4 audio-only recordings as video/mp4, and chat uploads are
// otherwise restricted to AI_READABLE_TYPES, so video/mp4 here can only be a
// voice note.
export const isAudioContentType = (contentType: string): boolean => {
  const type = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return type.startsWith("audio/") || type === "video/mp4";
};

export interface StoredChatAttachment {
  contentType: string;
  fileName: string;
  id: string;
  sizeBytes: number;
}

// Shared persistence for anything that lands in chat_attachment: the composer
// upload route and the transcribe route's voice-note retention both store the
// bytes in the private R2 bucket and record the row here, so the object-key
// layout and metadata stay identical. Returns null when the row insert fails
// (the caller decides whether that is fatal).
export const storeChatAttachment = async (params: {
  bytes: ArrayBuffer;
  contentType: string;
  fileName: string;
  threadId: string | null;
  uploadedBy: string;
}): Promise<StoredChatAttachment | null> => {
  const fileName = sanitizeFileName(params.fileName);
  const fileKey = `chat/${params.threadId ?? "unbound"}/${crypto.randomUUID()}/${fileName}`;

  const { env } = getCloudflareContext();
  await env.PHOTO_BUCKET.put(fileKey, params.bytes, {
    httpMetadata: { contentType: params.contentType },
  });

  const [created] = await db
    .insert(chatAttachment)
    .values({
      contentType: params.contentType,
      fileKey,
      fileName,
      sizeBytes: params.bytes.byteLength,
      threadId: params.threadId,
      uploadedBy: params.uploadedBy,
    })
    .returning({ id: chatAttachment.id });

  if (!created) {
    return null;
  }
  return {
    contentType: params.contentType,
    fileName,
    id: created.id,
    sizeBytes: params.bytes.byteLength,
  };
};

// The references persisted on the user turn. Ordered to match attachmentIds;
// unknown ids are dropped. Scoped to the uploader: attachment ids arrive in
// the client-controlled request body, so without this filter one user could
// reference (and reparent) another user's uploads.
export const buildMediaRefBlocks = async (
  attachmentIds: string[],
  uploadedBy: string
): Promise<BluMediaBlock[]> => {
  const ids = attachmentIds.slice(0, MAX_CHAT_ATTACHMENTS);
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      contentType: chatAttachment.contentType,
      fileName: chatAttachment.fileName,
      id: chatAttachment.id,
    })
    .from(chatAttachment)
    .where(
      and(
        inArray(chatAttachment.id, ids),
        eq(chatAttachment.uploadedBy, uploadedBy)
      )
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [
          {
            attachmentId: row.id,
            contentType: row.contentType,
            fileName: row.fileName,
            type: "blu_media" as const,
          },
        ]
      : [];
  });
};

// The subset of the given attachment ids that are retained voice notes, so
// the route can tell the model their ids via page context (the audio itself
// never reaches the model). Uploader-scoped like every id lookup here.
export const audioAttachmentIdsOf = async (
  attachmentIds: string[],
  uploadedBy: string
): Promise<string[]> => {
  const ids = attachmentIds.slice(0, MAX_CHAT_ATTACHMENTS);
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({ contentType: chatAttachment.contentType, id: chatAttachment.id })
    .from(chatAttachment)
    .where(
      and(
        inArray(chatAttachment.id, ids),
        eq(chatAttachment.uploadedBy, uploadedBy)
      )
    );
  return rows
    .filter((row) => isAudioContentType(row.contentType))
    .map((row) => row.id);
};

// Once the thread exists, claim any files uploaded before it was created so
// they are cleaned up with the thread. Uploader-scoped for the same reason as
// buildMediaRefBlocks: ids are client-supplied.
export const linkAttachmentsToThread = async (
  attachmentIds: string[],
  threadId: string,
  uploadedBy: string
): Promise<void> => {
  for (const id of attachmentIds.slice(0, MAX_CHAT_ATTACHMENTS)) {
    await db
      .update(chatAttachment)
      .set({ threadId })
      .where(
        and(
          eq(chatAttachment.id, id),
          eq(chatAttachment.uploadedBy, uploadedBy)
        )
      );
  }
};

type SniffedImageType = Anthropic.Base64ImageSource["media_type"];

// Anthropic sniffs the real bytes and rejects a base64 image whose declared
// media_type disagrees with them (a 400 that kills the whole turn). The stored
// contentType is only the browser-declared MIME captured at upload, which
// browsers and operating systems routinely mislabel (a PNG saved as .jpg, a
// screenshot paste), so it cannot be trusted as the media_type. We read the
// magic number and send the true type instead.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38]; // "GIF8" (87a/89a)
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]; // "RIFF" at offset 0
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

const IMAGE_CONTENT_TYPES = new Set<SniffedImageType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const matchesAt = (
  bytes: Uint8Array,
  signature: number[],
  offset = 0
): boolean => signature.every((byte, index) => bytes[offset + index] === byte);

const detectImageMediaType = (buffer: ArrayBuffer): SniffedImageType | null => {
  const bytes = new Uint8Array(buffer);
  if (matchesAt(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }
  if (matchesAt(bytes, JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  if (matchesAt(bytes, RIFF_SIGNATURE) && matchesAt(bytes, WEBP_SIGNATURE, 8)) {
    return "image/webp";
  }
  if (matchesAt(bytes, GIF_SIGNATURE)) {
    return "image/gif";
  }
  return null;
};

const isImageContentType = (
  contentType: string
): contentType is SniffedImageType =>
  IMAGE_CONTENT_TYPES.has(contentType as SniffedImageType);

const toMediaBlock = (
  contentType: string,
  buffer: ArrayBuffer
): Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | null => {
  const data = arrayBufferToBase64(buffer);
  if (contentType === "application/pdf") {
    return {
      source: { data, media_type: "application/pdf", type: "base64" },
      type: "document",
    };
  }
  // Prefer the type sniffed from the bytes; fall back to the stored
  // contentType only when the magic number is unrecognised.
  const sniffed = detectImageMediaType(buffer);
  const mediaType =
    sniffed ?? (isImageContentType(contentType) ? contentType : null);
  if (mediaType) {
    return {
      source: { data, media_type: mediaType, type: "base64" },
      type: "image",
    };
  }
  return null;
};

const loadMediaBlocksById = async (
  attachmentIds: string[]
): Promise<
  Map<string, Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam>
> => {
  const blocks = new Map<
    string,
    Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam
  >();
  if (attachmentIds.length === 0) {
    return blocks;
  }
  const allRows = await db
    .select({
      contentType: chatAttachment.contentType,
      fileKey: chatAttachment.fileKey,
      id: chatAttachment.id,
    })
    .from(chatAttachment)
    .where(inArray(chatAttachment.id, attachmentIds));
  // Voice notes are display/retention only: never rehydrated into model
  // content (and not worth an R2 round-trip here).
  const rows = allRows.filter((row) => !isAudioContentType(row.contentType));
  const { env } = getCloudflareContext();
  // Fetch every attachment from R2 concurrently. Read sequentially this
  // serialised the network round-trips, stretching the turn's wall-clock (and
  // its risk of tripping the Worker CPU limit) with each extra file.
  const loaded = await Promise.all(
    rows.map(async (row) => {
      const object = await env.PHOTO_BUCKET.get(row.fileKey);
      if (!object) {
        return null;
      }
      const block = toMediaBlock(row.contentType, await object.arrayBuffer());
      return block ? ([row.id, block] as const) : null;
    })
  );
  for (const entry of loaded) {
    if (entry) {
      blocks.set(entry[0], entry[1]);
    }
  }
  return blocks;
};

// A deal attachment loaded from R2 as a real base64 media block, ready to
// show the model. Used by the view_deal_file tool (live vision) and by the
// lazy/eager description generator — both read the bytes once.
export interface LoadedAttachmentMedia {
  block: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam;
  contentType: string;
  fileName: string;
  id: string;
}

export const loadDealAttachmentMedia = async (
  attachmentIds: string[]
): Promise<LoadedAttachmentMedia[]> => {
  if (attachmentIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      contentType: attachment.contentType,
      fileKey: attachment.fileKey,
      fileName: attachment.fileName,
      id: attachment.id,
    })
    .from(attachment)
    .where(inArray(attachment.id, attachmentIds));
  const { env } = getCloudflareContext();
  const loaded = await Promise.all(
    rows.map(async (row) => {
      // Audio (a voice note copied onto the deal by log_activity) is never
      // shown to the model; skip before spending an R2 read on it.
      if (!row.contentType || isAudioContentType(row.contentType)) {
        return null;
      }
      const object = await env.PHOTO_BUCKET.get(row.fileKey);
      if (!object) {
        return null;
      }
      const block = toMediaBlock(row.contentType, await object.arrayBuffer());
      return block
        ? ({
            block,
            contentType: row.contentType,
            fileName: row.fileName,
            id: row.id,
          } satisfies LoadedAttachmentMedia)
        : null;
    })
  );
  return loaded.filter(
    (entry): entry is LoadedAttachmentMedia => entry !== null
  );
};

// Replaces every persisted `blu_media` reference with a real base64 media
// block. Prompt-caches the last (most recent) block so the agent loop's
// in-turn replays don't re-bill the bytes.
export const rehydrateMediaInMessages = async (
  messages: Anthropic.MessageParam[]
): Promise<Anthropic.MessageParam[]> => {
  // blu_media is not part of the Anthropic union, so scan content as unknown
  // to let the type guard narrow correctly.
  const ids: string[] = [];
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const block of message.content as unknown[]) {
        if (isBluMediaBlock(block)) {
          ids.push(block.attachmentId);
        }
      }
    }
  }
  if (ids.length === 0) {
    return messages;
  }

  const blockById = await loadMediaBlocksById(ids);

  const rehydrated = messages.map((message) => {
    if (!Array.isArray(message.content)) {
      return message;
    }
    const blocks = message.content as unknown[];
    if (!blocks.some(isBluMediaBlock)) {
      return message;
    }
    const content: Anthropic.ContentBlockParam[] = [];
    for (const block of blocks) {
      if (isBluMediaBlock(block)) {
        const media = blockById.get(block.attachmentId);
        if (media) {
          content.push(media);
        }
        continue;
      }
      content.push(block as Anthropic.ContentBlockParam);
    }
    return { ...message, content };
  });

  // Prompt-cache the most recent media block so the loop's in-turn replays
  // don't re-bill the bytes. The same object reference now lives in content,
  // so mutating it here updates the message too.
  const lastId = [...ids].reverse().find((id) => blockById.has(id));
  const lastBlock = lastId ? blockById.get(lastId) : undefined;
  if (lastBlock) {
    lastBlock.cache_control = { type: "ephemeral" };
  }
  return rehydrated;
};
