import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachment } from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";
import {
  cacheAttachmentDescription,
  describeMedia,
  describeText,
} from "@/lib/ai/attachment-describe";
import {
  loadDealAttachmentBytes,
  loadDealAttachmentMedia,
} from "@/lib/ai/attachments";
import { isAiConfigured } from "@/lib/ai/client";
import { indexAttachmentText } from "@/lib/ai/documents";
import { extractOfficeText } from "@/lib/ai/office-extract";
import { defineTool } from "@/lib/ai/tools/types";

const MAX_VIEW_FILES = 3;

// How much extracted document text a single view returns to the model. The
// full text stays in the search index; the view surfaces the opening so the
// model can read the actual content without bloating the persisted history.
const VIEW_TEXT_MAX_CHARS = 6000;

const viewDealFileSchema = z.object({
  attachmentIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_VIEW_FILES)
    .describe("Attachment ids from get_deal's files list (up to 3)."),
});

interface FileRow {
  aiDescribedAt: Date | null;
  contentType: string | null;
  dealId: string;
  fileName: string;
  id: string;
}

// Images/PDFs: hand image bytes to the model this turn, and on first view
// cache a description + index it. Returns the image blocks and one summary line
// per file.
const viewMediaFiles = async (
  media: Awaited<ReturnType<typeof loadDealAttachmentMedia>>,
  rowById: Map<string, FileRow>
): Promise<{ imageBlocks: Anthropic.ImageBlockParam[]; lines: string[] }> => {
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  const lines: string[] = [];
  for (const item of media) {
    if (item.block.type === "image") {
      imageBlocks.push(item.block);
    }
    const row = rowById.get(item.id);
    let description: string | null = null;
    if (!row?.aiDescribedAt && isAiConfigured()) {
      description = await describeMedia(item.block, item.fileName);
      if (description) {
        await cacheAttachmentDescription(item.id, description);
        await indexAttachmentText({
          attachmentId: item.id,
          dealId: row?.dealId ?? "",
          text: `${item.fileName}\n${description}`,
        }).catch(() => undefined);
      }
    }
    lines.push(
      description ? `${item.fileName}: ${description}` : item.fileName
    );
  }
  return { imageBlocks, lines };
};

// Office documents: return extracted text and, on first view, index it and
// cache a description. Returns one block of text per readable file.
const viewOfficeFiles = async (
  officeFiles: Awaited<ReturnType<typeof loadDealAttachmentBytes>>,
  rowById: Map<string, FileRow>
): Promise<string[]> => {
  const lines: string[] = [];
  for (const file of officeFiles) {
    const text = await extractOfficeText(file.buffer, file.contentType);
    if (!text) {
      lines.push(`${file.fileName}: no readable text found.`);
      continue;
    }
    const row = rowById.get(file.id);
    if (!row?.aiDescribedAt) {
      await indexAttachmentText({
        attachmentId: file.id,
        dealId: row?.dealId ?? "",
        text,
      }).catch(() => undefined);
      if (isAiConfigured()) {
        const description = await describeText(text, file.fileName);
        if (description) {
          await cacheAttachmentDescription(file.id, description);
        }
      }
    }
    const shown =
      text.length > VIEW_TEXT_MAX_CHARS
        ? `${text.slice(0, VIEW_TEXT_MAX_CHARS)}\n…(truncated; use search_deal_documents to find more)`
        : text;
    lines.push(`${file.fileName} (extracted text):\n${shown}`);
  }
  return lines;
};

// Lets the assistant actually look at a deal's files. Images are returned as
// real bytes for this turn only; Office documents (Word/Excel/PowerPoint) are
// text-extracted and returned as text. On first view a file is enriched
// (description cached, content indexed for search) so later turns and
// search_deal_documents can use it cheaply.
const viewDealFile = defineTool({
  description:
    "Open and look at the actual contents of up to 3 of a deal's files. Call get_deal first to get the file ids, then pass them here. Images are returned for you to see; Word, Excel, and PowerPoint documents are returned as extracted text; PDFs are summarised. The first view also caches a short description and indexes the content for search_deal_documents. Legacy .doc/.xls/.ppt binaries cannot be read.",
  execute: async (input) => {
    const ids = input.attachmentIds.slice(0, MAX_VIEW_FILES);
    const rows: FileRow[] = await db
      .select({
        aiDescribedAt: attachment.aiDescribedAt,
        contentType: attachment.contentType,
        dealId: attachment.dealId,
        fileName: attachment.fileName,
        id: attachment.id,
      })
      .from(attachment)
      .where(inArray(attachment.id, ids));
    if (rows.length === 0) {
      return { resultText: "No matching files found on this deal." };
    }
    const rowById = new Map(rows.map((row) => [row.id, row]));

    const media = await loadDealAttachmentMedia(ids);
    const officeFiles = await loadDealAttachmentBytes(ids);
    const handledIds = new Set<string>([
      ...media.map((item) => item.id),
      ...officeFiles.map((file) => file.id),
    ]);

    const [mediaResult, officeLines] = await Promise.all([
      viewMediaFiles(media, rowById),
      viewOfficeFiles(officeFiles, rowById),
    ]);
    const lines = [...mediaResult.lines, ...officeLines];

    // Anything left is a format we cannot read (legacy binary, unknown type).
    for (const row of rows) {
      if (!handledIds.has(row.id)) {
        lines.push(
          `${row.fileName}: cannot be read (${row.contentType ?? "unknown type"}).`
        );
      }
    }

    return {
      media: mediaResult.imageBlocks,
      resultText: `Viewed ${rows.length} file(s), ${mediaResult.imageBlocks.length} image(s).\n${lines.join("\n")}`,
    };
  },
  isWrite: false,
  name: "view_deal_file",
  schema: viewDealFileSchema,
});

export const fileTools = [viewDealFile];
