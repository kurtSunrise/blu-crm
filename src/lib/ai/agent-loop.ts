import type * as Anthropic from "@/lib/ai/anthropic";
import {
  buildInstructionsBlock,
  getAssistantInstructions,
} from "@/lib/ai/assistant-instructions";
import { recordProposedToolCall } from "@/lib/ai/audit";
import { getAiModel, streamMessage } from "@/lib/ai/client";
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
  ctx: AiToolContext;
  // Full replayable history including the just-persisted user turn
  messages: Anthropic.MessageParam[];
  send: (payload: StreamPayload) => void;
}

// A tool result can diverge: `live` is what the model sees this turn (may
// carry real image blocks from view_deal_file), `persisted` is the lean text
// stored in history so replays stay cheap. They are identical for every tool
// that returns no media.
interface ToolCallResults {
  live: Anthropic.ToolResultBlockParam[];
  persisted: Anthropic.ToolResultBlockParam[];
}

const runReadToolCalls = async (
  toolUses: Anthropic.ToolUseBlock[],
  params: AgentTurnParams
): Promise<ToolCallResults> => {
  const live: Anthropic.ToolResultBlockParam[] = [];
  const persisted: Anthropic.ToolResultBlockParam[] = [];
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
    persisted.push({
      content: outcome.resultText,
      is_error: outcome.isError,
      tool_use_id: block.id,
      type: "tool_result",
    });
    // The Messages API accepts image blocks inside a tool_result, but the
    // SDK's ToolResultBlockParam content type only lists text blocks, so the
    // mixed array is cast to the param type.
    const liveContent = outcome.media?.length
      ? ([
          { text: outcome.resultText, type: "text" },
          ...outcome.media,
        ] as Anthropic.ToolResultBlockParam["content"])
      : outcome.resultText;
    live.push({
      content: liveContent,
      is_error: outcome.isError,
      tool_use_id: block.id,
      type: "tool_result",
    });
  }
  return { live, persisted };
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

  // Held reads resume after the write is confirmed, so they go through the
  // persisted (text) path; any image media is captured by the cached
  // description instead.
  const { persisted: heldToolResults } = await runReadToolCalls(reads, params);
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
  const { ctx, messages, send } = params;

  // Built once per turn: the static prompt keeps its own cache breakpoint
  // (always a hit) and the team instructions, when set, become a second cached
  // block. Caching is prefix-based, so the static prefix still hits on the rare
  // turn right after the instructions change.
  const instructionsBlock = buildInstructionsBlock(
    await getAssistantInstructions()
  );
  const system: Anthropic.TextBlockParam[] = [
    {
      cache_control: { type: "ephemeral" },
      text: SYSTEM_PROMPT,
      type: "text",
    },
  ];
  if (instructionsBlock) {
    system.push({
      cache_control: { type: "ephemeral" },
      text: instructionsBlock,
      type: "text",
    });
  }

  const model = await getAiModel();

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    // Per-iteration latches so each status is emitted once: "thinking" the
    // first time the model makes silent progress, "responding" the first time
    // visible text arrives. Both keep the client's stall watchdog fed.
    let sentThinking = false;
    let sentResponding = false;
    const finalMessage = await streamMessage(
      {
        max_tokens: MAX_OUTPUT_TOKENS,
        messages,
        model,
        system,
        thinking: { type: "adaptive" },
        tools: TOOL_DEFINITIONS,
      },
      {
        onActivity: () => {
          if (!sentThinking) {
            sentThinking = true;
            send({ state: "thinking", type: "status" });
          }
        },
        onText: (delta) => {
          if (!sentResponding) {
            sentResponding = true;
            send({ state: "responding", type: "status" });
          }
          send({ delta, type: "text" });
        },
      }
    );
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

    const { live, persisted } = await runReadToolCalls(toolUses, params);
    await appendThreadMessage(ctx.threadId, "user", persisted);
    messages.push({ content: live, role: "user" });
  }

  send({
    message: "I hit the limit for one turn. Ask me to continue if needed.",
    retryable: true,
    type: "error",
  });
};
