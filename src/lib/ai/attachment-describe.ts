import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSetting, attachment } from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";
import { loadDealAttachmentMedia } from "@/lib/ai/attachments";
import { createMessage, getAiModel, isAiConfigured } from "@/lib/ai/client";
import { AI_READABLE_TYPES } from "@/lib/validation/attachment";

// Cached AI vision descriptions for deal files. Generated either lazily (the
// first time the assistant views a file) or eagerly (in the background on
// upload), controlled by the admin setting below. Once stored, get_deal
// surfaces the text so later turns recall the file without re-spending image
// tokens or Worker CPU.

export const ATTACHMENT_DESCRIPTION_MODE_KEY = "attachment_description_mode";

export type AttachmentDescriptionMode = "lazy" | "eager";

export const DEFAULT_ATTACHMENT_DESCRIPTION_MODE: AttachmentDescriptionMode =
  "lazy";

export const getAttachmentDescriptionMode =
  async (): Promise<AttachmentDescriptionMode> => {
    const [row] = await db
      .select({ value: appSetting.value })
      .from(appSetting)
      .where(eq(appSetting.key, ATTACHMENT_DESCRIPTION_MODE_KEY))
      .limit(1);
    return row?.value === "eager"
      ? "eager"
      : DEFAULT_ATTACHMENT_DESCRIPTION_MODE;
  };

const DESCRIBE_MAX_TOKENS = 400;

const DESCRIBE_PROMPT =
  "Describe this file attached to a building/construction sales deal in a CRM. In 1 to 3 plain sentences, state what it shows and any detail useful for sales context: site conditions, dimensions, materials or brands, quoted items, or the document type. Be concrete and factual, with no preamble.";

const extractText = (message: Anthropic.Message): string => {
  for (const block of message.content) {
    if (block.type === "text") {
      return block.text.trim();
    }
  }
  return "";
};

// Run a single vision call against an already-loaded media block.
export const describeMedia = async (
  block: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam,
  fileName: string
): Promise<string> => {
  const message = await createMessage({
    max_tokens: DESCRIBE_MAX_TOKENS,
    messages: [
      {
        content: [
          block,
          { text: `${DESCRIBE_PROMPT}\nFile name: ${fileName}`, type: "text" },
        ],
        role: "user",
      },
    ],
    model: await getAiModel(),
  });
  return extractText(message);
};

export const cacheAttachmentDescription = async (
  attachmentId: string,
  description: string
): Promise<void> => {
  await db
    .update(attachment)
    .set({ aiDescription: description, aiDescribedAt: new Date() })
    .where(eq(attachment.id, attachmentId));
};

// Generate and cache descriptions for any of the given attachments that are
// AI-readable and not yet described. Used by eager (on-upload) mode; the view
// tool caches inline so it can reuse the bytes it already loaded.
export const describeAttachmentsByIds = async (
  attachmentIds: string[]
): Promise<void> => {
  if (!isAiConfigured() || attachmentIds.length === 0) {
    return;
  }
  const rows = await db
    .select({
      aiDescription: attachment.aiDescription,
      contentType: attachment.contentType,
      id: attachment.id,
    })
    .from(attachment)
    .where(inArray(attachment.id, attachmentIds));

  const pending = rows
    .filter(
      (row) =>
        !row.aiDescription &&
        row.contentType !== null &&
        AI_READABLE_TYPES.has(row.contentType)
    )
    .map((row) => row.id);
  if (pending.length === 0) {
    return;
  }

  const media = await loadDealAttachmentMedia(pending);
  for (const item of media) {
    const description = await describeMedia(item.block, item.fileName);
    if (description) {
      await cacheAttachmentDescription(item.id, description);
    }
  }
};
