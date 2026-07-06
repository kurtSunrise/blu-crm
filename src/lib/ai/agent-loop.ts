import type * as Anthropic from "@/lib/ai/anthropic";
import { saveMessageArtifacts } from "@/lib/ai/artifact-store";
import {
  buildInstructionsBlock,
  getAssistantInstructions,
} from "@/lib/ai/assistant-instructions";
import { recordProposedToolCall } from "@/lib/ai/audit";
import { getAiModel, streamMessage } from "@/lib/ai/client";
import type { ArtifactPayload, StreamPayload } from "@/lib/ai/stream-protocol";
import { deriveFollowUpSuggestions } from "@/lib/ai/suggestions";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { appendThreadMessage, setThreadPending } from "@/lib/ai/threads";
import {
  executeToolCall,
  isWriteTool,
  summarizeToolActivity,
  summarizeToolCall,
  TOOL_DEFINITIONS,
} from "@/lib/ai/tools";
import type { AiToolContext } from "@/lib/ai/tools/types";

// One request hosts the whole multi-tool turn, so both caps are defensive:
// the model is also instructed to keep turns focused.
const MAX_LOOP_ITERATIONS = 8;
const MAX_OUTPUT_TOKENS = 32_000;

// What the turn has done so far; feeds the deterministic follow-up
// suggestions at end of turn. The route seeds it on the confirmed-write
// resume path so suggestions also reflect the writes just executed there.
export interface TurnActivity {
  artifactTypes: string[];
  toolsUsed: string[];
  wroteChanges: boolean;
}

export interface AgentTurnParams {
  ctx: AiToolContext;
  // Full replayable history including the just-persisted user turn
  messages: Anthropic.MessageParam[];
  send: (payload: StreamPayload) => void;
  turnActivity?: TurnActivity;
}

export interface AgentTurnResult {
  // The id of the last persisted assistant chat_message, for done.messageId
  lastAssistantMessageId: string | null;
}

// A tool result can diverge: `live` is what the model sees this turn (may
// carry real image blocks from view_deal_file), `persisted` is the lean text
// stored in history so replays stay cheap. They are identical for every tool
// that returns no media. `artifacts` collects the streamed artifact payloads
// so the caller can persist them against their chat_message.
interface ToolCallResults {
  artifacts: ArtifactPayload[];
  live: Anthropic.ToolResultBlockParam[];
  persisted: Anthropic.ToolResultBlockParam[];
}

const runReadToolCalls = async (
  toolUses: Anthropic.ToolUseBlock[],
  params: AgentTurnParams,
  activity: TurnActivity
): Promise<ToolCallResults> => {
  const artifacts: ArtifactPayload[] = [];
  const live: Anthropic.ToolResultBlockParam[] = [];
  const persisted: Anthropic.ToolResultBlockParam[] = [];
  for (const block of toolUses) {
    params.send({
      label: summarizeToolActivity(block.name),
      toolName: block.name,
      toolUseId: block.id,
      type: "tool_start",
    });
    const outcome = await executeToolCall(block.name, block.input, params.ctx);
    activity.toolsUsed.push(block.name);
    for (const artifact of outcome.artifacts ?? []) {
      params.send(artifact);
      artifacts.push(artifact);
      activity.artifactTypes.push(artifact.artifactType);
    }
    if (outcome.sources?.length) {
      params.send({ sources: outcome.sources, type: "sources" });
    }
    params.send({
      isError: outcome.isError,
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
  return { artifacts, live, persisted };
};

// Write tools pause the turn for user confirmation (FR-7.8). All write
// tool_use blocks queue as one plan, in content order, reviewed together as a
// checklist and executed sequentially by the route once confirmed. Read tools
// from the same assistant turn run now; their results are held with the plan
// so the resume message can answer every tool_use at once.
const pauseForConfirmation = async (
  toolUses: Anthropic.ToolUseBlock[],
  params: AgentTurnParams,
  assistantMessageId: string,
  activity: TurnActivity,
  artifactPosition: number
): Promise<void> => {
  const reads = toolUses.filter((block) => !isWriteTool(block.name));
  const writes = toolUses.filter((block) => isWriteTool(block.name));
  if (writes.length === 0) {
    return;
  }

  // Held reads resume after the plan is resolved, so they go through the
  // persisted (text) path; any image media is captured by the cached
  // description instead.
  const { artifacts, persisted: heldToolResults } = await runReadToolCalls(
    reads,
    params,
    activity
  );
  await saveMessageArtifacts(
    params.ctx.threadId,
    assistantMessageId,
    artifacts,
    artifactPosition
  );

  const items = writes.map((block) => ({
    input: block.input,
    summary: summarizeToolCall(block.name),
    toolName: block.name,
    toolUseId: block.id,
  }));

  // Audit rows before the plan, sequentially: their createdAt order is the
  // proposal order the transcript renders, and an orphaned "proposed" row is
  // harmless while a live plan without audit anchors would not resolve.
  for (const item of items) {
    await recordProposedToolCall({
      input: item.input,
      messageId: assistantMessageId,
      threadId: params.ctx.threadId,
      toolName: item.toolName,
      toolUseId: item.toolUseId,
      userId: params.ctx.userId,
    });
  }
  await setThreadPending(params.ctx.threadId, {
    heldToolResults,
    items,
    version: 2,
  });

  // Legacy top-level fields mirror items[0] so a stale client bundle
  // mid-deploy still renders a single-item card.
  const [first] = items;
  params.send({
    input: first.input,
    items,
    summary: first.summary,
    toolName: first.toolName,
    toolUseId: first.toolUseId,
    type: "confirmation_request",
  });
};

// Manual agentic loop (not the SDK tool runner) because write tools must
// pause mid-turn for user confirmation instead of executing.
export const runAgentTurn = async (
  params: AgentTurnParams
): Promise<AgentTurnResult> => {
  const { ctx, messages, send } = params;

  const activity: TurnActivity = {
    artifactTypes: [...(params.turnActivity?.artifactTypes ?? [])],
    toolsUsed: [...(params.turnActivity?.toolsUsed ?? [])],
    wroteChanges: params.turnActivity?.wroteChanges ?? false,
  };

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

  let lastAssistantMessageId: string | null = null;
  // Artifact positions increase monotonically across the whole turn so cards
  // keep their emission order within each message.
  let artifactPosition = 0;

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    // Per-iteration latches so each status is emitted once: "thinking" the
    // first time the model makes silent progress, "responding" the first time
    // visible text arrives. Both keep the client's stall watchdog fed.
    let sentThinking = false;
    let sentResponding = false;
    const markThinking = (): void => {
      if (!sentThinking) {
        sentThinking = true;
        send({ state: "thinking", type: "status" });
      }
    };
    const finalMessage = await streamMessage(
      {
        max_tokens: MAX_OUTPUT_TOKENS,
        messages,
        model,
        system,
        // display "summarized" streams readable thinking summaries for the
        // reasoning section; adaptive alone emits empty thinking text.
        thinking: { display: "summarized", type: "adaptive" },
        tools: TOOL_DEFINITIONS,
      },
      {
        onActivity: markThinking,
        onText: (delta) => {
          if (!sentResponding) {
            sentResponding = true;
            send({ state: "responding", type: "status" });
          }
          send({ delta, type: "text" });
        },
        onThinking: (delta) => {
          markThinking();
          send({ delta, type: "reasoning" });
        },
      }
    );
    const assistantMessageId = await appendThreadMessage(
      ctx.threadId,
      "assistant",
      finalMessage.content
    );
    lastAssistantMessageId = assistantMessageId;
    messages.push({ content: finalMessage.content, role: "assistant" });

    if (finalMessage.stop_reason === "pause_turn") {
      continue;
    }

    const toolUses = finalMessage.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (finalMessage.stop_reason !== "tool_use" || toolUses.length === 0) {
      // Normal end of turn (final text response): offer follow-up chips.
      // The confirmation pause and error paths deliberately send none.
      send({
        prompts: deriveFollowUpSuggestions(activity),
        type: "suggestions",
      });
      return { lastAssistantMessageId };
    }

    if (toolUses.some((block) => isWriteTool(block.name))) {
      await pauseForConfirmation(
        toolUses,
        params,
        assistantMessageId,
        activity,
        artifactPosition
      );
      return { lastAssistantMessageId };
    }

    const { artifacts, live, persisted } = await runReadToolCalls(
      toolUses,
      params,
      activity
    );
    await saveMessageArtifacts(
      ctx.threadId,
      assistantMessageId,
      artifacts,
      artifactPosition
    );
    artifactPosition += artifacts.length;
    await appendThreadMessage(ctx.threadId, "user", persisted);
    messages.push({ content: live, role: "user" });
  }

  send({
    message: "I hit the limit for one turn. Ask me to continue if needed.",
    retryable: true,
    type: "error",
  });
  return { lastAssistantMessageId };
};
