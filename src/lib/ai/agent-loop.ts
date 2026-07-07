import type * as Anthropic from "@/lib/ai/anthropic";
import {
  type PersistableArtifact,
  saveMessageArtifacts,
} from "@/lib/ai/artifact-store";
import {
  buildInstructionsBlock,
  getAssistantInstructions,
} from "@/lib/ai/assistant-instructions";
import { recordProposedToolCall } from "@/lib/ai/audit";
import { createCitationNumberer } from "@/lib/ai/citations";
import { getAiModel, streamMessage } from "@/lib/ai/client";
import { buildMemoryBlock } from "@/lib/ai/memory";
import type {
  ArtifactPayload,
  SourceRef,
  StreamPayload,
} from "@/lib/ai/stream-protocol";
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
  // Auto-saved memories (save_memory runs inline): streamed as memory_saved
  // payloads and persisted as memory_saved artifact rows so the chip (with
  // its Undo) re-renders on thread resume.
  memorySaved: { memoryId: string; content: string }[];
  persisted: Anthropic.ToolResultBlockParam[];
  sources: SourceRef[];
}

const runReadToolCalls = async (
  toolUses: Anthropic.ToolUseBlock[],
  params: AgentTurnParams,
  activity: TurnActivity
): Promise<ToolCallResults> => {
  const artifacts: ArtifactPayload[] = [];
  const live: Anthropic.ToolResultBlockParam[] = [];
  const memorySaved: { memoryId: string; content: string }[] = [];
  const persisted: Anthropic.ToolResultBlockParam[] = [];
  const sources: SourceRef[] = [];
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
      sources.push(...outcome.sources);
    }
    if (outcome.memorySaved) {
      params.send({ ...outcome.memorySaved, type: "memory_saved" });
      memorySaved.push(outcome.memorySaved);
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
    const mediaContent = outcome.media?.length
      ? ([
          { text: outcome.resultText, type: "text" },
          ...outcome.media,
        ] as Anthropic.ToolResultBlockParam["content"])
      : outcome.resultText;
    live.push({
      // Citable search_result blocks (when the tool provides them) go to the
      // model live-only; the persisted result above keeps the lean text.
      content: outcome.searchResults?.length
        ? outcome.searchResults
        : mediaContent,
      is_error: outcome.isError,
      tool_use_id: block.id,
      type: "tool_result",
    });
  }
  return { artifacts, live, memorySaved, persisted, sources };
};

// Turn sections persisted alongside the final assistant message so thread
// resume rebuilds them: the reasoning summary first (it reads before the
// answer text) and the deduped source chips last. Live streaming already sent
// both; these rows are additive persistence only.
const turnSectionArtifacts = (
  reasoningText: string,
  sources: SourceRef[]
): PersistableArtifact[] => {
  const rows: PersistableArtifact[] = [];
  if (reasoningText.length > 0) {
    rows.push({ artifactType: "reasoning", data: { text: reasoningText } });
  }
  if (sources.length > 0) {
    // Same shape as the live stream payload so consumers of chat_artifact
    // rows and wire payloads read one format.
    rows.push({ artifactType: "sources", data: { sources } });
  }
  return rows;
};

// Write tools pause the turn for user confirmation (FR-7.8). All write
// tool_use blocks queue as one plan, in content order, reviewed together as a
// checklist and executed sequentially by the route once confirmed. Read tools
// from the same assistant turn run now; their results are held with the plan
// so the resume message can answer every tool_use at once.
const pauseForConfirmation = async (
  writes: Anthropic.ToolUseBlock[],
  params: AgentTurnParams,
  assistantMessageId: string,
  heldToolResults: Anthropic.ToolResultBlockParam[]
): Promise<void> => {
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
  // (always a hit), the team instructions become a second cached block, and
  // the user's remembered context a third (4 breakpoints allowed; 3 used).
  // Caching is prefix-based, so each block only busts its own suffix when it
  // changes and the static prefix always hits.
  const [instructions, memoryBlock] = await Promise.all([
    getAssistantInstructions(),
    buildMemoryBlock(ctx.userId),
  ]);
  const instructionsBlock = buildInstructionsBlock(instructions);
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
  if (memoryBlock) {
    system.push({
      cache_control: { type: "ephemeral" },
      text: memoryBlock,
      type: "text",
    });
  }

  const model = await getAiModel();

  let lastAssistantMessageId: string | null = null;
  // Artifact positions increase monotonically across the whole turn so cards
  // keep their emission order within each message.
  let artifactPosition = 0;

  // Accumulated across every loop iteration for end-of-turn persistence:
  // reasoning summaries (one part per iteration that produced any) and the
  // knowledge sources deduped by doc and heading, in first-seen order.
  const reasoningParts: string[] = [];
  const turnSources = new Map<string, SourceRef>();
  const collectSources = (sources: SourceRef[]): void => {
    for (const source of sources) {
      const key = `${source.docTitle}\n${source.heading ?? ""}`;
      if (!turnSources.has(key)) {
        turnSources.set(key, source);
      }
    }
  };

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    // Per-iteration latches so each status is emitted once: "thinking" the
    // first time the model makes silent progress, "responding" the first time
    // visible text arrives. Both keep the client's stall watchdog fed.
    let sentThinking = false;
    let sentResponding = false;
    let iterationReasoning = "";
    const markThinking = (): void => {
      if (!sentThinking) {
        sentThinking = true;
        send({ state: "thinking", type: "status" });
      }
    };
    // Numbered per assistant message, same numberer semantics the resume path
    // uses (encounter order, dedupe by title), so live and resumed markers
    // agree. The " [N]" marker is injected into the visible stream only; the
    // persisted content keeps the API's own citation records untouched.
    const citationNumberer = createCitationNumberer();
    // A span citing the same source in consecutive citation events would
    // stream " [1] [1]"; suppress repeats until other text intervenes.
    let lastStreamedMarker: number | null = null;
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
        onCitation: (citation) => {
          const assigned = citationNumberer.assign(citation);
          if (!assigned) {
            return;
          }
          // The cited span has just finished streaming, so the marker lands
          // right after it; resume injects the same marker at the block end.
          if (assigned.marker !== lastStreamedMarker) {
            send({ delta: ` [${assigned.marker}]`, type: "text" });
            lastStreamedMarker = assigned.marker;
          }
          if (assigned.isNew) {
            send({
              marker: assigned.marker,
              snippet: assigned.snippet,
              title: assigned.title,
              type: "citation",
            });
          }
        },
        onText: (delta) => {
          if (!sentResponding) {
            sentResponding = true;
            send({ state: "responding", type: "status" });
          }
          lastStreamedMarker = null;
          send({ delta, type: "text" });
        },
        onThinking: (delta) => {
          markThinking();
          iterationReasoning += delta;
          send({ delta, type: "reasoning" });
        },
      }
    );
    if (iterationReasoning.trim().length > 0) {
      reasoningParts.push(iterationReasoning.trim());
    }
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
      // Normal end of turn (final text response): persist the turn sections
      // against this final message so resume rebuilds the reasoning block and
      // source chips, then offer follow-up chips. The confirmation pause and
      // error paths deliberately send none.
      await saveMessageArtifacts(
        ctx.threadId,
        assistantMessageId,
        turnSectionArtifacts(reasoningParts.join("\n\n"), [
          ...turnSources.values(),
        ]),
        artifactPosition
      );
      send({
        prompts: deriveFollowUpSuggestions(activity),
        type: "suggestions",
      });
      return { lastAssistantMessageId };
    }

    if (toolUses.some((block) => isWriteTool(block.name))) {
      // Held reads resume after the plan is resolved, so they go through the
      // persisted (text) path; any image media is captured by the cached
      // description instead.
      const reads = toolUses.filter((block) => !isWriteTool(block.name));
      const held = await runReadToolCalls(reads, params, activity);
      collectSources(held.sources);
      await saveMessageArtifacts(
        ctx.threadId,
        assistantMessageId,
        [
          ...held.artifacts,
          ...held.memorySaved.map((data) => ({
            artifactType: "memory_saved",
            data,
          })),
        ],
        artifactPosition
      );
      artifactPosition += held.artifacts.length + held.memorySaved.length;
      // A confirmation pause ends this request, and the post-approval
      // continuation starts a fresh turn with empty accumulators, so the
      // reasoning and sources gathered so far persist here or never.
      await saveMessageArtifacts(
        ctx.threadId,
        assistantMessageId,
        turnSectionArtifacts(reasoningParts.join("\n\n"), [
          ...turnSources.values(),
        ]),
        artifactPosition
      );
      await pauseForConfirmation(
        toolUses.filter((block) => isWriteTool(block.name)),
        params,
        assistantMessageId,
        held.persisted
      );
      return { lastAssistantMessageId };
    }

    const { artifacts, live, memorySaved, persisted, sources } =
      await runReadToolCalls(toolUses, params, activity);
    collectSources(sources);
    await saveMessageArtifacts(
      ctx.threadId,
      assistantMessageId,
      [
        ...artifacts,
        ...memorySaved.map((data) => ({ artifactType: "memory_saved", data })),
      ],
      artifactPosition
    );
    artifactPosition += artifacts.length + memorySaved.length;
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
