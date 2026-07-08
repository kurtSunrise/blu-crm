import { z } from "zod";
import type * as Anthropic from "@/lib/ai/anthropic";
import {
  type DealDocumentPassage,
  hasIndexedDocuments,
  searchDealDocuments,
} from "@/lib/ai/documents";
import type { SourceRef } from "@/lib/ai/stream-protocol";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";

// Searches the content of documents uploaded onto deals (Word, Excel,
// PowerPoint, PDF text). Distinct from search_knowledge_base, which holds
// company policy: this reads the deal's own files. Retrieval is the same hybrid
// full-text + vector search, with each file as the citation source.

const searchDealDocumentsSchema = z.object({
  query: z
    .string()
    .describe(
      "What to look for in the deal's uploaded documents, e.g. scope of works, quoted materials, dimensions, deadline"
    ),
  dealId: z
    .string()
    .optional()
    .describe(
      "Restrict the search to one deal's files (the id from get_deal). Omit to search across every deal's documents."
    ),
});

const MAX_SOURCES = 5;

const sourcesFromPassages = (passages: DealDocumentPassage[]): SourceRef[] => {
  const sources: SourceRef[] = [];
  const seen = new Set<string>();
  for (const passage of passages) {
    if (seen.has(passage.fileName)) {
      continue;
    }
    seen.add(passage.fileName);
    sources.push({
      docTitle: passage.fileName,
      heading: null,
      updatedAt: passage.createdAt,
    });
    if (sources.length >= MAX_SOURCES) {
      break;
    }
  }
  return sources;
};

// Native citations: each passage as a search_result block, live-only (same
// tradeoff as search_knowledge_base). Titles are deduped with a part number so
// two chunks of one file do not collapse onto a single citation marker.
export const buildDocumentSearchResults = (
  passages: DealDocumentPassage[]
): Anthropic.SearchResultBlockParam[] => {
  const titleCounts = new Map<string, number>();
  return passages.map((passage) => {
    const seen = titleCounts.get(passage.fileName) ?? 0;
    titleCounts.set(passage.fileName, seen + 1);
    return {
      citations: { enabled: true },
      content: [{ text: passage.content, type: "text" }],
      source: passage.fileName,
      title:
        seen === 0
          ? passage.fileName
          : `${passage.fileName} (part ${seen + 1})`,
      type: "search_result",
    };
  });
};

const searchDealDocumentsTool = defineTool({
  description:
    "Search the text of documents uploaded onto deals (Word, Excel, PowerPoint, and read PDFs) for a scope of works, quoted items, dimensions, deadlines, or client requirements. Pass a dealId to search one deal's files, or omit it to search across all deals. Returns matching passages with the source file. This reads deal files, not company policy (use search_knowledge_base for that).",
  execute: async (input) => {
    const passages = await searchDealDocuments(input.query, {
      dealId: input.dealId,
    });
    if (passages.length === 0) {
      const anyIndexed = await hasIndexedDocuments(input.dealId);
      return {
        resultText: anyIndexed
          ? "No uploaded documents matched that query."
          : "No document content is indexed yet for that scope. The files may not have been opened/enriched; use view_deal_file to read a specific document.",
      };
    }
    return {
      resultText: JSON.stringify(passages),
      searchResults: buildDocumentSearchResults(passages),
      sources: sourcesFromPassages(passages),
    };
  },
  isWrite: false,
  name: "search_deal_documents",
  schema: searchDealDocumentsSchema,
});

export const documentTools: AiTool[] = [searchDealDocumentsTool];
