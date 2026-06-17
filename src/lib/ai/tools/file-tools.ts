import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachment } from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";
import {
  cacheAttachmentDescription,
  describeMedia,
} from "@/lib/ai/attachment-describe";
import { loadDealAttachmentMedia } from "@/lib/ai/attachments";
import { isAiConfigured } from "@/lib/ai/client";
import { defineTool } from "@/lib/ai/tools/types";

const MAX_VIEW_FILES = 3;

const viewDealFileSchema = z.object({
  attachmentIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_VIEW_FILES)
    .describe("Attachment ids from get_deal's files list (up to 3)."),
});

// Lets the assistant actually look at a deal's images. The real image bytes
// are returned for this turn only (the agent loop puts them in the live tool
// result, not the persisted one); a text description is cached on first view
// so get_deal can recall the file cheaply afterwards.
const viewDealFile = defineTool({
  description:
    "Open and look at the actual contents of up to 3 of a deal's images. Call get_deal first to get the file ids, then pass them here. Returns the images for you to see; the first view also caches a short description so future references are free. Non-image files (Office docs) cannot be viewed inline.",
  execute: async (input) => {
    const ids = input.attachmentIds.slice(0, MAX_VIEW_FILES);
    const rows = await db
      .select({
        aiDescription: attachment.aiDescription,
        contentType: attachment.contentType,
        fileName: attachment.fileName,
        id: attachment.id,
      })
      .from(attachment)
      .where(inArray(attachment.id, ids));
    if (rows.length === 0) {
      return { resultText: "No matching files found on this deal." };
    }
    const metaById = new Map(rows.map((row) => [row.id, row]));

    const media = await loadDealAttachmentMedia(ids);
    const loadedIds = new Set(media.map((item) => item.id));
    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    const lines: string[] = [];

    for (const item of media) {
      if (item.block.type === "image") {
        imageBlocks.push(item.block);
      }
      let description = metaById.get(item.id)?.aiDescription ?? null;
      if (!description && isAiConfigured()) {
        description = await describeMedia(item.block, item.fileName);
        if (description) {
          await cacheAttachmentDescription(item.id, description);
        }
      }
      lines.push(
        description ? `${item.fileName}: ${description}` : item.fileName
      );
    }

    for (const row of rows) {
      if (!loadedIds.has(row.id)) {
        lines.push(
          `${row.fileName}: cannot be viewed inline (${row.contentType ?? "unknown type"}).`
        );
      }
    }

    return {
      media: imageBlocks,
      resultText: `Viewed ${imageBlocks.length} image(s).\n${lines.join("\n")}`,
    };
  },
  isWrite: false,
  name: "view_deal_file",
  schema: viewDealFileSchema,
});

export const fileTools = [viewDealFile];
