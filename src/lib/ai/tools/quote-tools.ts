import { z } from "zod";
import {
  DEAL_HANDLE_DESCRIPTION,
  resolveDealId,
} from "@/lib/ai/tools/resolve-deal";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import { createQuoteCore } from "@/lib/mutations/quote";

const createQuoteSchema = z.object({
  dealId: z.string().describe(DEAL_HANDLE_DESCRIPTION),
  valueDollars: z.number().positive().describe("Quote value in AUD dollars"),
});

const createQuoteTool = defineTool({
  description:
    "Record a draft quote at a value on a deal (tracking only; quotes themselves are built outside the CRM). The quote starts as a draft; sending and outcomes happen on the deal page.",
  execute: async (input, ctx) => {
    const dealId = await resolveDealId(input.dealId);
    if (!dealId) {
      return {
        resultText: `No deal found for "${input.dealId}". Use query_deals or get_deal to find it.`,
      };
    }
    const outcome = await createQuoteCore({
      ...input,
      createdBy: ctx.userId,
      dealId,
    });
    if (outcome.error) {
      return { resultText: `Quote failed: ${outcome.error}` };
    }
    return {
      changedPaths: [`/deals/${dealId}`],
      resultText: "Draft quote recorded.",
    };
  },
  isWrite: true,
  name: "create_quote",
  schema: createQuoteSchema,
});

export const quoteTools: AiTool[] = [createQuoteTool];
