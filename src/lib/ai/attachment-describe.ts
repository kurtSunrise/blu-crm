import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSetting, attachment } from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";
import {
  loadDealAttachmentBytes,
  loadDealAttachmentMedia,
} from "@/lib/ai/attachments";
import { createMessage, getAiModel, isAiConfigured } from "@/lib/ai/client";
import { indexAttachmentText } from "@/lib/ai/documents";
import {
  extractOfficeText,
  isOfficeExtractable,
} from "@/lib/ai/office-extract";
import { AI_READABLE_TYPES } from "@/lib/validation/attachment";

// Enrichment for deal files: turns an uploaded document into semantic content
// the assistant can use. Images/PDFs get a cached vision description; Office
// documents get their text extracted, indexed for hybrid search, and
// summarised. Runs lazily (first view) or eagerly (background on upload),
// controlled by the admin setting below. Once stored, get_deal surfaces the
// description so later turns recall the file without re-spending tokens, and
// search_deal_documents can retrieve the indexed content.

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

// The most a document's extracted text contributes to the summary call. The
// opening pages carry the title, client, and scope; more than this wastes
// tokens on a 1-to-3 sentence blurb.
const DESCRIBE_TEXT_MAX_INPUT_CHARS = 8000;

// Summarise an Office document from its extracted text (no image tokens). The
// same prompt as describeMedia so get_deal's file descriptions read uniformly
// whether the file was seen by vision or read as text.
export const describeText = async (
  text: string,
  fileName: string
): Promise<string> => {
  const message = await createMessage({
    max_tokens: DESCRIBE_MAX_TOKENS,
    messages: [
      {
        content: [
          {
            text: `${DESCRIBE_PROMPT}\nFile name: ${fileName}\n\nDocument text:\n${text.slice(
              0,
              DESCRIBE_TEXT_MAX_INPUT_CHARS
            )}`,
            type: "text",
          },
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

interface EnrichRow {
  aiDescribedAt: Date | null;
  contentType: string | null;
  dealId: string;
  id: string;
}

const isReadableRow = (row: EnrichRow): boolean =>
  row.contentType !== null &&
  (AI_READABLE_TYPES.has(row.contentType) ||
    isOfficeExtractable(row.contentType));

// Materialise the semantic layer for Office documents: extract their text,
// index it for hybrid search, and cache a short description. Runs the two
// writes (index, then describe) independently so a failed summary still leaves
// the searchable index in place.
const enrichOfficeAttachments = async (rows: EnrichRow[]): Promise<void> => {
  if (rows.length === 0) {
    return;
  }
  const dealById = new Map(rows.map((row) => [row.id, row.dealId]));
  const files = await loadDealAttachmentBytes(rows.map((row) => row.id));
  for (const file of files) {
    const text = await extractOfficeText(file.buffer, file.contentType);
    if (!text) {
      continue;
    }
    const dealId = dealById.get(file.id);
    if (!dealId) {
      continue;
    }
    const indexed = await indexAttachmentText({
      attachmentId: file.id,
      dealId,
      text,
    });
    const description = await describeText(text, file.fileName);
    if (description) {
      await cacheAttachmentDescription(file.id, description);
    }
    console.log("[attachment-index]", {
      chunks: indexed.chunkCount,
      embedded: indexed.embeddedCount,
      id: file.id,
      kind: "office",
    });
  }
};

// Images and PDFs: describe via vision as before, and index the description
// text so every document object is searchable regardless of modality (cheap,
// the description is already generated).
const enrichVisionAttachments = async (rows: EnrichRow[]): Promise<void> => {
  if (rows.length === 0) {
    return;
  }
  const dealById = new Map(rows.map((row) => [row.id, row.dealId]));
  const media = await loadDealAttachmentMedia(rows.map((row) => row.id));
  for (const item of media) {
    const description = await describeMedia(item.block, item.fileName);
    if (!description) {
      continue;
    }
    await cacheAttachmentDescription(item.id, description);
    const dealId = dealById.get(item.id);
    if (!dealId) {
      continue;
    }
    const indexed = await indexAttachmentText({
      attachmentId: item.id,
      dealId,
      text: `${item.fileName}\n${description}`,
    });
    console.log("[attachment-index]", {
      chunks: indexed.chunkCount,
      embedded: indexed.embeddedCount,
      id: item.id,
      kind: "vision",
    });
  }
};

// Enrich the given attachments into the document semantic layer: extract or
// describe their content, cache a description on the row, and index it for
// search. Idempotent (skips rows already enriched, keyed on aiDescribedAt).
// Used by eager (on-upload) mode and lazily by view_deal_file.
export const enrichAttachmentsByIds = async (
  attachmentIds: string[]
): Promise<void> => {
  if (!isAiConfigured() || attachmentIds.length === 0) {
    return;
  }
  const rows: EnrichRow[] = await db
    .select({
      aiDescribedAt: attachment.aiDescribedAt,
      contentType: attachment.contentType,
      dealId: attachment.dealId,
      id: attachment.id,
    })
    .from(attachment)
    .where(inArray(attachment.id, attachmentIds));

  const pending = rows.filter(
    (row) => !row.aiDescribedAt && isReadableRow(row)
  );
  if (pending.length === 0) {
    return;
  }

  await enrichOfficeAttachments(
    pending.filter((row) => isOfficeExtractable(row.contentType))
  );
  await enrichVisionAttachments(
    pending.filter(
      (row) =>
        row.contentType !== null && AI_READABLE_TYPES.has(row.contentType)
    )
  );
};
