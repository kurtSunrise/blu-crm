import { z } from "zod";
import { completeFollowUp } from "@/lib/actions/follow-up-actions";
import {
  DEAL_HANDLE_DESCRIPTION,
  resolveDealId,
} from "@/lib/ai/tools/resolve-deal";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import { createFollowUpCore } from "@/lib/mutations/follow-up";

const createFollowUpSchema = z.object({
  action: z
    .string()
    .min(1)
    .describe("The next action, e.g. 'Call to confirm budget'"),
  dealId: z.string().describe(DEAL_HANDLE_DESCRIPTION),
  dueDate: z.string().describe("Due date as YYYY-MM-DD"),
  ownerId: z.string().describe("Team member id from list_team_members"),
});

const createFollowUpTool = defineTool({
  description:
    "Create a follow-up task (next action) on a deal with an owner and due date. Every open deal should carry one; propose this after logging activity or moving a stage when no next action exists.",
  execute: async (input, ctx) => {
    const dueDate = new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return { resultText: `Invalid due date: ${input.dueDate}` };
    }
    const dealId = await resolveDealId(input.dealId);
    if (!dealId) {
      return {
        resultText: `No deal found for "${input.dealId}". Use query_deals or get_deal to find it.`,
      };
    }
    const outcome = await createFollowUpCore({
      action: input.action,
      createdBy: ctx.userId,
      dealId,
      dueDate,
      ownerId: input.ownerId,
    });
    if (outcome.error) {
      return { resultText: `Follow-up failed: ${outcome.error}` };
    }
    return {
      changedPaths: ["/", "/tasks", `/deals/${dealId}`],
      resultText: "Follow-up created.",
    };
  },
  isWrite: true,
  name: "create_follow_up",
  schema: createFollowUpSchema,
});

const completeFollowUpSchema = z.object({
  followUpId: z.string().describe("Follow-up id from get_deal"),
});

const completeFollowUpTool = defineTool({
  description:
    "Mark a follow-up task as done. After completing one, check whether the deal needs a new next action.",
  execute: async (input) => {
    const outcome = await completeFollowUp(input);
    if (outcome.error) {
      return { resultText: `Completion failed: ${outcome.error}` };
    }
    return {
      changedPaths: ["/", "/tasks"],
      resultText: "Follow-up marked done.",
    };
  },
  isWrite: true,
  name: "complete_follow_up",
  schema: completeFollowUpSchema,
});

export const followUpTools: AiTool[] = [
  createFollowUpTool,
  completeFollowUpTool,
];
