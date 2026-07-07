import type * as Anthropic from "@/lib/ai/anthropic";
import { dealWriteTools } from "@/lib/ai/tools/deal-tools";
import { draftTools } from "@/lib/ai/tools/draft-tools";
import { fileTools } from "@/lib/ai/tools/file-tools";
import { followUpTools } from "@/lib/ai/tools/follow-up-tools";
import { knowledgeTools } from "@/lib/ai/tools/knowledge-tools";
import { memoryTools } from "@/lib/ai/tools/memory-tools";
import { queryTools } from "@/lib/ai/tools/query-tools";
import { quoteTools } from "@/lib/ai/tools/quote-tools";
import { reportTools } from "@/lib/ai/tools/report-tools";
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
  ...reportTools,
  ...scoringTools,
  ...draftTools,
  ...dealWriteTools,
  ...followUpTools,
  ...quoteTools,
  ...triageTools,
  ...knowledgeTools,
  ...fileTools,
  ...memoryTools,
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

// Present-tense activity line streamed with tool_start and shown live in the
// transcript while a tool runs ("Searching deals…").
const ACTIVITY_LABELS: Record<string, string> = {
  complete_follow_up: "Completing the follow-up",
  create_follow_up: "Creating a follow-up",
  create_lead: "Creating the lead",
  create_quote: "Recording the quote",
  get_company: "Loading company",
  get_contact: "Loading contact",
  get_deal: "Loading deal",
  get_inbox_leads: "Checking the inbox",
  get_weekly_report: "Building the weekly report",
  list_pipeline_stages: "Loading pipeline stages",
  list_team_members: "Loading the team",
  log_activity: "Logging the activity",
  move_deal_stage: "Moving the deal",
  present_draft: "Preparing a draft",
  query_deals: "Searching deals",
  rank_open_deals: "Ranking open deals",
  save_memory: "Saving a memory",
  search_knowledge_base: "Searching the knowledge base",
  triage_inbox_lead: "Triaging the lead",
  update_contact: "Updating the contact",
  update_deal: "Updating the deal",
  view_deal_file: "Viewing a file",
};

export const summarizeToolActivity = (name: string): string =>
  ACTIVITY_LABELS[name] ?? `Running ${name}`;

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
