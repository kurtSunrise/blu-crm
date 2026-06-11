import type Anthropic from "@anthropic-ai/sdk";
import { draftTools } from "@/lib/ai/tools/draft-tools";
import { queryTools } from "@/lib/ai/tools/query-tools";
import type {
  AiTool,
  AiToolContext,
  AiToolOutcome,
} from "@/lib/ai/tools/types";

// The tool set is static across every page and request: swapping tools per
// surface would invalidate the prompt cache prefix (tools render before
// system). Page relevance is steered by the <page_context> block instead.
const ALL_TOOLS: AiTool[] = [...queryTools, ...draftTools];

const TOOLS_BY_NAME = new Map(
  ALL_TOOLS.map((tool) => [tool.definition.name, tool])
);

export const TOOL_DEFINITIONS: Anthropic.Tool[] = ALL_TOOLS.map(
  (tool) => tool.definition
);

export const isWriteTool = (name: string): boolean =>
  TOOLS_BY_NAME.get(name)?.isWrite ?? false;

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
