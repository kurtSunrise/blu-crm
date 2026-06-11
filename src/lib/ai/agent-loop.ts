import type Anthropic from "@anthropic-ai/sdk";
import { recordProposedToolCall } from "@/lib/ai/audit";
import { getAiModel } from "@/lib/ai/client";
import type { StreamPayload } from "@/lib/ai/stream-protocol";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { appendThreadMessage, setThreadPending } from "@/lib/ai/threads";
import {
  executeToolCall,
  isWriteTool,
  summarizeToolCall,
  TOOL_DEFINITIONS,
} from "@/lib/ai/tools";
import type { AiToolContext } from "@/lib/ai/tools/types";

// One request hosts the whole multi-tool turn, so both caps are defensive:
// the model is also instructed to keep turns focused.
const MAX_LOOP_ITERATIONS = 8;
const MAX_OUTPUT_TOKENS = 32_000;

export interface AgentTurnParams {
  client: Anthropic;
  ctx: AiToolContext;
  // Full replayable history including the just-persisted user turn
  messages: Anthropic.MessageParam[];
  send: (payload: StreamPayload) => void;
}

const runReadToolCalls = async (
  toolUses: Anthropic.ToolUseBlock[],
  params: AgentTurnParams
): Promise<Anthropic.ToolResultBlockParam[]> => {
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of toolUses) {
    params.send({
      toolName: block.name,
      toolUseId: block.id,
      type: "tool_start",
    });
    const outcome = await executeToolCall(block.name, block.input, params.ctx);
    for (const artifact of outcome.artifacts ?? []) {
      params.send(artifact);
    }
    params.send({
      toolName: block.name,
      toolUseId: block.id,
      type: "tool_done",
    });
    results.push({
      content: outcome.resultText,
      is_error: outcome.isError,
      tool_use_id: block.id,
      type: "tool_result",
    });
  }
  return results;
};

// A write tool pauses the turn for user confirmation (FR-7.8). Read tools
// from the same assistant turn run now; their results are held with the
// pending write so the resume message can answer every tool_use at once.
// Extra writes beyond the first are declined (one write per turn).
const pauseForConfirmation = async (
  toolUses: Anthropic.ToolUseBlock[],
  params: AgentTurnParams
): Promise<void> => {
  const reads = toolUses.filter((block) => !isWriteTool(block.name));
  const writes = toolUses.filter((block) => isWriteTool(block.name));
  const [gated, ...extraWrites] = writes;
  if (!gated) {
    return;
  }

  const heldToolResults = await runReadToolCalls(reads, params);
  for (const extra of extraWrites) {
    heldToolResults.push({
      content:
        "Declined automatically: propose one change at a time and wait for the user's decision before the next.",
      is_error: true,
      tool_use_id: extra.id,
      type: "tool_result",
    });
  }

  const summary = summarizeToolCall(gated.name);
  await setThreadPending(params.ctx.threadId, {
    heldToolResults,
    input: gated.input,
    summary,
    toolName: gated.name,
    toolUseId: gated.id,
  });
  await recordProposedToolCall({
    input: gated.input,
    threadId: params.ctx.threadId,
    toolName: gated.name,
    toolUseId: gated.id,
    userId: params.ctx.userId,
  });
  params.send({
    input: gated.input,
    summary,
    toolName: gated.name,
    toolUseId: gated.id,
    type: "confirmation_request",
  });
};

// Manual agentic loop (not the SDK tool runner) because write tools must
// pause mid-turn for user confirmation instead of executing.
export const runAgentTurn = async (params: AgentTurnParams): Promise<void> => {
  const { client, ctx, messages, send } = params;

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    const stream = client.messages.stream({
      max_tokens: MAX_OUTPUT_TOKENS,
      messages,
      model: getAiModel(),
      system: [
        {
          cache_control: { type: "ephemeral" },
          text: SYSTEM_PROMPT,
          type: "text",
        },
      ],
      thinking: { type: "adaptive" },
      tools: TOOL_DEFINITIONS,
    });

    stream.on("text", (delta) => {
      send({ delta, type: "text" });
    });

    const finalMessage = await stream.finalMessage();
    await appendThreadMessage(ctx.threadId, "assistant", finalMessage.content);
    messages.push({ content: finalMessage.content, role: "assistant" });

    if (finalMessage.stop_reason === "pause_turn") {
      continue;
    }

    const toolUses = finalMessage.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (finalMessage.stop_reason !== "tool_use" || toolUses.length === 0) {
      return;
    }

    if (toolUses.some((block) => isWriteTool(block.name))) {
      await pauseForConfirmation(toolUses, params);
      return;
    }

    const toolResults = await runReadToolCalls(toolUses, params);
    await appendThreadMessage(ctx.threadId, "user", toolResults);
    messages.push({ content: toolResults, role: "user" });
  }

  send({
    message: "I hit the limit for one turn. Ask me to continue if needed.",
    retryable: true,
    type: "error",
  });
};
