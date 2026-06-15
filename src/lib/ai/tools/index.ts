import type * as Anthropic from "@/lib/ai/anthropic";
import { dealWriteTools } from "@/lib/ai/tools/deal-tools";
import { draftTools } from "@/lib/ai/tools/draft-tools";
import { followUpTools } from "@/lib/ai/tools/follow-up-tools";
import { knowledgeTools } from "@/lib/ai/tools/knowledge-tools";
import { queryTools } from "@/lib/ai/tools/query-tools";
import { quoteTools } from "@/lib/ai/tools/quote-tools";
import { scoringTools } from "@/lib/ai/tools/scoring-tools";
import { triageTools } from "@/lib/ai/tools/triage-tools";
import type {
  AiTool,
  AiToolContext,
  AiToolOutcome,
} from "@/lib/ai/tools/types";

// The tool set is static across every page and request: swapping tools per
// surface would invalidate the prompt cache prefix (tools render before
// system). Page relevance is steered by the <page_context> block instead.
const ALL_TOOLS: AiTool[] = [
  ...queryTools,
  ...scoringTools,
  ...draftTools,
  ...dealWriteTools,
  ...followUpTools,
  ...quoteTools,
  ...triageTools,
  ...knowledgeTools,
];

const TOOLS_BY_NAME = new Map(
  ALL_TOOLS.map((tool) => [tool.definition.name, tool])
);

export const TOOL_DEFINITIONS: Anthropic.Tool[] = ALL_TOOLS.map(
  (tool) => tool.definition
);

export const isWriteTool = (name: string): boolean =>
  TOOLS_BY_NAME.get(name)?.isWrite ?? false;

// Short human-readable line shown on the confirmation card (FR-7.8).
const SUMMARY_LABELS: Record<string, string> = {
  complete_follow_up: "Mark a follow-up as done",
  create_follow_up: "Create a follow-up task",
  create_lead: "Create a new lead",
  create_quote: "Record a draft quote",
  log_activity: "Log an activity",
  move_deal_stage: "Move a deal to another stage",
  triage_inbox_lead: "Triage an inbox lead",
  update_contact: "Update a contact",
  update_deal: "Update a deal",
};

export const summarizeToolCall = (name: string): string =>
  SUMMARY_LABELS[name] ?? `Run ${name}`;

export const executeToolCall = async (
  name: string,
  input: unknown,
  ctx: AiToolContext
): Promise<AiToolOutcome & { isError: boolean }> => {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) {
    return { isError: true, resultText: `Unknown tool: ${name}` };
  }
  try {
    const outcome = await tool.execute(input, ctx);
    return { ...outcome, isError: false };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tool execution failed";
    return { isError: true, resultText: `Tool error: ${message}` };
  }
};
