import { z } from "zod";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import { createQuoteCore } from "@/lib/mutations/quote";

const createQuoteSchema = z.object({
  dealId: z.string(),
  valueDollars: z.number().positive().describe("Quote value in AUD dollars"),
});

const createQuoteTool = defineTool({
  description:
    "Record a draft quote at a value on a deal (tracking only; quotes themselves are built outside the CRM). The quote starts as a draft; sending and outcomes happen on the deal page.",
  execute: async (input) => {
    const outcome = await createQuoteCore(input);
    if (outcome.error) {
      return { resultText: `Quote failed: ${outcome.error}` };
    }
    return {
      changedPaths: [`/deals/${input.dealId}`],
      resultText: "Draft quote recorded.",
    };
  },
  isWrite: true,
  name: "create_quote",
  schema: createQuoteSchema,
});

export const quoteTools: AiTool[] = [createQuoteTool];
