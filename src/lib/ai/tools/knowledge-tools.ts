import { z } from "zod";
import { searchKnowledge } from "@/lib/ai/knowledge";
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
    return { resultText: JSON.stringify(passages) };
  },
  isWrite: false,
  name: "search_knowledge_base",
  schema: searchKnowledgeBaseSchema,
});

export const knowledgeTools: AiTool[] = [searchKnowledgeBase];
