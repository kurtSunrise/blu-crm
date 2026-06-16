import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chatAttachment } from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";

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

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
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

// The references persisted on the user turn. Ordered to match attachmentIds;
// unknown ids are dropped.
export const buildMediaRefBlocks = async (
  attachmentIds: string[]
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
    .where(inArray(chatAttachment.id, ids));
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

// Once the thread exists, claim any files uploaded before it was created so
// they are cleaned up with the thread.
export const linkAttachmentsToThread = async (
  attachmentIds: string[],
  threadId: string
): Promise<void> => {
  for (const id of attachmentIds.slice(0, MAX_CHAT_ATTACHMENTS)) {
    await db
      .update(chatAttachment)
      .set({ threadId })
      .where(eq(chatAttachment.id, id));
  }
};

const toMediaBlock = (
  contentType: string,
  data: string
): Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | null => {
  if (contentType === "application/pdf") {
    return {
      source: { data, media_type: "application/pdf", type: "base64" },
      type: "document",
    };
  }
  if (
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp"
  ) {
    return {
      source: { data, media_type: contentType, type: "base64" },
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
  const rows = await db
    .select({
      contentType: chatAttachment.contentType,
      fileKey: chatAttachment.fileKey,
      id: chatAttachment.id,
    })
    .from(chatAttachment)
    .where(inArray(chatAttachment.id, attachmentIds));
  const { env } = getCloudflareContext();
  for (const row of rows) {
    const object = await env.PHOTO_BUCKET.get(row.fileKey);
    if (!object) {
      continue;
    }
    const block = toMediaBlock(
      row.contentType,
      arrayBufferToBase64(await object.arrayBuffer())
    );
    if (block) {
      blocks.set(row.id, block);
    }
  }
  return blocks;
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
