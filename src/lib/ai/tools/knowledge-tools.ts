import { z } from "zod";
import type * as Anthropic from "@/lib/ai/anthropic";
import { type KnowledgePassage, searchKnowledge } from "@/lib/ai/knowledge";
import type { SourceRef } from "@/lib/ai/stream-protocol";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";

// FR-7 knowledge base: a read-only tool the model calls for "how we do things"
// questions (brand voice, sales process, quoting/pricing rules). Retrieval is
// lexical full-text search over the company corpus; results are returned as
// passages for the model to ground its answer in.

const searchKnowledgeBaseSchema = z.object({
  query: z
    .string()
    .describe(
      "What to look up in the company knowledge base, e.g. brand voice, deposit terms, how to qualify a lead"
    ),
});

const MAX_SOURCES = 5;

// Citation chips for the answer: one per distinct doc/heading, in rank order
// so the strongest match leads, capped to keep the chip row scannable.
const sourcesFromPassages = (passages: KnowledgePassage[]): SourceRef[] => {
  const sources: SourceRef[] = [];
  const seen = new Set<string>();
  for (const passage of passages) {
    const key = `${passage.docTitle} ${passage.heading ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sources.push({
      docTitle: passage.docTitle,
      heading: passage.heading,
      updatedAt: passage.updatedAt,
    });
    if (sources.length >= MAX_SOURCES) {
      break;
    }
  }
  return sources;
};

// Native citations (Assistant v3 Phase 3): the passages rendered as
// search_result content blocks with citations enabled. The agent loop puts
// these in the LIVE tool_result only, so the model's answer carries typed
// search_result_location citations this turn; the persisted result keeps the
// plain resultText JSON, so replayed turns lose citability by design (the
// same tradeoff as image descriptions). `source` is the doc title
// (KnowledgePassage has no slug); `title` is "docTitle § heading", or the
// doc title alone when the chunk has no heading.
export const buildKnowledgeSearchResults = (
  passages: KnowledgePassage[]
): Anthropic.SearchResultBlockParam[] => {
  // Citations dedupe by title, so two chunks of the same long section must
  // not share one: a shared title would collapse them onto one marker whose
  // snippet quotes the wrong chunk. Suffix repeats with a part number.
  const titleCounts = new Map<string, number>();
  return passages.map((passage) => {
    const baseTitle = passage.heading
      ? `${passage.docTitle} § ${passage.heading}`
      : passage.docTitle;
    const seen = titleCounts.get(baseTitle) ?? 0;
    titleCounts.set(baseTitle, seen + 1);
    return {
      citations: { enabled: true },
      content: [{ text: passage.content, type: "text" }],
      source: passage.docTitle,
      title: seen === 0 ? baseTitle : `${baseTitle} (part ${seen + 1})`,
      type: "search_result",
    };
  });
};

const searchKnowledgeBase = defineTool({
  description:
    "Search Blu's internal knowledge base for company policy and how-we-work guidance: brand voice and tone, the sales process, qualifying rules, and quoting/pricing terms. Call this for 'how do we...', policy, voice, or pricing-rule questions instead of guessing. Returns relevant passages, not CRM records.",
  execute: async (input) => {
    const passages = await searchKnowledge(input.query);
    if (passages.length === 0) {
      return {
        resultText:
          "No knowledge base entries matched that query. Tell the user you don't have a documented answer rather than guessing.",
      };
    }
    return {
      resultText: JSON.stringify(passages),
      // Live-only citable variant of this result; the loop sends it to the
      // model this turn while resultText is what history keeps.
      searchResults: buildKnowledgeSearchResults(passages),
      sources: sourcesFromPassages(passages),
    };
  },
  isWrite: false,
  name: "search_knowledge_base",
  schema: searchKnowledgeBaseSchema,
});

export const knowledgeTools: AiTool[] = [searchKnowledgeBase];
