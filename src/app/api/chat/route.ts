import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, count, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { chatMessage, chatThread } from "@/db/schema";
import { runAgentTurn, type TurnActivity } from "@/lib/ai/agent-loop";
import type * as Anthropic from "@/lib/ai/anthropic";
import { saveMessageArtifacts } from "@/lib/ai/artifact-store";
import { resolveAssistantUser } from "@/lib/ai/assistant-user";
import {
  audioAttachmentIdsOf,
  type BluMediaBlock,
  buildMediaRefBlocks,
  linkAttachmentsToThread,
} from "@/lib/ai/attachments";
import { resolveAuditedToolCall } from "@/lib/ai/audit";
import { isAiConfigured } from "@/lib/ai/client";
import { buildPageContext } from "@/lib/ai/page-context";
import {
  type ArtifactPayload,
  encodeStreamPayload,
  type StreamPayload,
} from "@/lib/ai/stream-protocol";
import {
  appendThreadMessage,
  clearThreadPending,
  createThread,
  getThreadForUser,
  loadThreadMessages,
  maybeCompactThread,
  type PendingPlan,
  type PendingPlanItem,
  parsePendingPlan,
  rollbackForEdit,
  rollbackToLastPlainUserTurn,
  type ThreadRecord,
} from "@/lib/ai/threads";
import { executeToolCall, summarizeToolActivity } from "@/lib/ai/tools";

const TITLE_MAX_LENGTH = 60;

// Per-user daily spend guard. The per-turn caps (loop iterations, output
// tokens) bound one turn; this bounds how many turns a single account can
// drive in a day. Generous for real use, it exists to stop a runaway client
// or a compromised account from burning unbounded model cost. Only user-role
// inserts count, so a regenerate (which appends no user turn) never grows it.
const DEFAULT_DAILY_MESSAGE_LIMIT = 200;

const dailyMessageLimit = (): number => {
  const configured = Number(process.env.CHAT_DAILY_MESSAGE_LIMIT);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_DAILY_MESSAGE_LIMIT;
};

const countMessagesToday = async (userId: string): Promise<number> => {
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ value: count(chatMessage.id) })
    .from(chatMessage)
    .innerJoin(chatThread, eq(chatMessage.threadId, chatThread.id))
    .where(
      and(
        eq(chatThread.userId, userId),
        eq(chatMessage.role, "user"),
        gte(chatMessage.createdAt, startOfUtcDay)
      )
    );
  return row?.value ?? 0;
};

const MAX_CHAT_ATTACHMENTS = 5;

// Comfortably fits a pasted email thread while rejecting pathological pastes
// that would bloat the model input and stretch one turn toward a timeout.
const MAX_MESSAGE_LENGTH = 16_000;

// Edited turns are composed by hand in the edit box, never pasted email
// threads, so they get a tighter cap (pinned contract with the chat UI).
const MAX_EDITED_MESSAGE_LENGTH = 4000;

// @-mentions resolved to context headers; a handful is plenty for one turn.
const MAX_MENTIONED_ENTITIES = 5;

// Matches the write-plan review card: one decision per plan item.
const MAX_PLAN_DECISIONS = 10;

const decisionSchema = z.object({
  approved: z.boolean(),
  // User-edited tool input from the confirmation checklist (two-way sync);
  // re-validated by the tool's own zod schema at execution time
  finalInput: z.unknown().optional(),
  toolUseId: z.string(),
});

const chatRequestSchema = z
  .object({
    // Ids from /api/chat/attachments; rehydrated to base64 media blocks when
    // the thread history is sent to the model.
    attachmentIds: z.array(z.string()).max(MAX_CHAT_ATTACHMENTS).optional(),
    // Either the per-item decisions array or the legacy single-decision
    // fields (kept for a stale client bundle during the deploy window).
    confirmation: z
      .object({
        approved: z.boolean().optional(),
        decisions: z.array(decisionSchema).max(MAX_PLAN_DECISIONS).optional(),
        finalInput: z.unknown().optional(),
        toolUseId: z.string().optional(),
      })
      .optional(),
    // Replaces the thread's last plain user turn (edit + resubmit): the turn
    // and everything after it roll back, then this text runs as a new message
    editedMessage: z
      .string()
      .trim()
      .min(1)
      .max(MAX_EDITED_MESSAGE_LENGTH)
      .optional(),
    message: z.string().min(1).max(MAX_MESSAGE_LENGTH).optional(),
    pageContext: z.object({
      contactId: z.string().optional(),
      dealId: z.string().optional(),
      // Entities @-mentioned in the composer; resolved server-side to the
      // same minimal headers as the viewed entity (least-context, PRD §9.3)
      mentionedContactIds: z
        .array(z.uuid())
        .max(MAX_MENTIONED_ENTITIES)
        .optional(),
      mentionedDealIds: z
        .array(z.uuid())
        .max(MAX_MENTIONED_ENTITIES)
        .optional(),
      pathname: z.string(),
    }),
    // Re-answer the thread's last plain user turn instead of adding one
    regenerate: z.boolean().optional(),
    threadId: z.string().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.message) ||
      Boolean(value.editedMessage) ||
      Boolean(value.confirmation) ||
      value.regenerate === true,
    {
      message:
        "Provide a message, an edited message, a confirmation, or a regenerate flag",
    }
  )
  .refine(
    (value) =>
      !(
        value.regenerate &&
        (value.message || value.confirmation || value.editedMessage)
      ),
    { message: "Regenerate cannot be combined with another request kind" }
  )
  .refine(
    (value) => !(value.editedMessage && (value.message || value.confirmation)),
    {
      message:
        "An edited message cannot be combined with a message or confirmation",
    }
  );

type ChatRequestBody = z.infer<typeof chatRequestSchema>;

type ConfirmationDecision = z.infer<typeof decisionSchema>;

// Accepts both request shapes: the decisions array, or the legacy top-level
// single decision normalized to a one-item array. Null means neither was
// well-formed.
const normalizeDecisions = (
  confirmation: NonNullable<ChatRequestBody["confirmation"]>
): ConfirmationDecision[] | null => {
  if (confirmation.decisions?.length) {
    return confirmation.decisions;
  }
  if (
    typeof confirmation.approved === "boolean" &&
    typeof confirmation.toolUseId === "string"
  ) {
    return [
      {
        approved: confirmation.approved,
        finalInput: confirmation.finalInput,
        toolUseId: confirmation.toolUseId,
      },
    ];
  }
  return null;
};

const deriveTitle = (message: string): string => {
  const collapsed = message.replaceAll(/\s+/g, " ").trim();
  return collapsed.length > TITLE_MAX_LENGTH
    ? `${collapsed.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : collapsed;
};

const SKIPPED_AFTER_FAILURE = "Not attempted: an earlier step failed.";

// One approved plan item: audit the confirm, run the tool between
// tool_start/tool_done, and audit the executed/failed outcome.
const executeApprovedItem = async (params: {
  effectiveInput: unknown;
  item: PendingPlanItem;
  send: (payload: StreamPayload) => void;
  threadId: string;
  userId: string;
}): Promise<Awaited<ReturnType<typeof executeToolCall>>> => {
  const { effectiveInput, item, send, threadId, userId } = params;
  await resolveAuditedToolCall({
    confirmedBy: userId,
    finalInput: effectiveInput,
    status: "confirmed",
    threadId,
    toolUseId: item.toolUseId,
  });
  send({
    label: summarizeToolActivity(item.toolName),
    toolName: item.toolName,
    toolUseId: item.toolUseId,
    type: "tool_start",
  });
  // defineTool re-validates effectiveInput against the tool's zod schema.
  const outcome = await executeToolCall(item.toolName, effectiveInput, {
    threadId,
    userId,
  });
  send({
    isError: outcome.isError,
    toolName: item.toolName,
    toolUseId: item.toolUseId,
    type: "tool_done",
  });
  await resolveAuditedToolCall({
    confirmedBy: userId,
    error: outcome.isError ? outcome.resultText : undefined,
    finalInput: effectiveInput,
    result: outcome.isError ? undefined : { resultText: outcome.resultText },
    status: outcome.isError ? "failed" : "executed",
    threadId,
    toolUseId: item.toolUseId,
  });
  return outcome;
};

interface PlanExecutionOutcome {
  artifacts: ArtifactPayload[];
  executedToolNames: string[];
  toolResults: Anthropic.ToolResultBlockParam[];
  wroteChanges: boolean;
}

// Resolve the pending write plan: apply approved items, decline skipped ones,
// audit every lifecycle step, and return the tool_result blocks that answer
// every tool_use of the paused assistant turn.
const executePendingPlan = async (params: {
  decisions: ConfirmationDecision[];
  plan: PendingPlan;
  send: (payload: StreamPayload) => void;
  threadId: string;
  userId: string;
}): Promise<PlanExecutionOutcome> => {
  const { decisions, plan, send, threadId, userId } = params;
  const decisionFor = new Map(
    decisions.map((decision) => [decision.toolUseId, decision])
  );
  const toolResults: Anthropic.ToolResultBlockParam[] = [
    ...plan.heldToolResults,
  ];
  const artifacts: ArtifactPayload[] = [];
  const executedToolNames: string[] = [];
  const changedPaths = new Set<string>();
  let failed = false;
  let wroteChanges = false;

  // Deliberately sequential, not Promise.all: plan items are order-dependent
  // writes, applied in proposal order and stopped at the first failure so a
  // partial prefix is always a coherent state.
  for (const item of plan.items) {
    const decision = decisionFor.get(item.toolUseId);
    // No decision defaults to skip: nothing applies without an explicit
    // approval (FR-7.8).
    if (!decision?.approved) {
      await resolveAuditedToolCall({
        confirmedBy: userId,
        status: "denied",
        threadId,
        toolUseId: item.toolUseId,
      });
      toolResults.push({
        content: "The user declined this step; nothing was changed.",
        tool_use_id: item.toolUseId,
        type: "tool_result",
      });
      continue;
    }
    if (failed) {
      await resolveAuditedToolCall({
        confirmedBy: userId,
        error: SKIPPED_AFTER_FAILURE,
        status: "skipped",
        threadId,
        toolUseId: item.toolUseId,
      });
      toolResults.push({
        content:
          "This step was not attempted because an earlier step in the plan failed.",
        is_error: true,
        tool_use_id: item.toolUseId,
        type: "tool_result",
      });
      continue;
    }

    const outcome = await executeApprovedItem({
      effectiveInput: decision.finalInput ?? item.input,
      item,
      send,
      threadId,
      userId,
    });
    for (const artifact of outcome.artifacts ?? []) {
      send(artifact);
      artifacts.push(artifact);
    }
    toolResults.push({
      content: outcome.resultText,
      is_error: outcome.isError,
      tool_use_id: item.toolUseId,
      type: "tool_result",
    });
    if (outcome.isError) {
      failed = true;
      continue;
    }
    wroteChanges = true;
    executedToolNames.push(item.toolName);
    for (const path of outcome.changedPaths ?? []) {
      changedPaths.add(path);
    }
  }

  // One deduped refresh signal for everything the plan changed.
  if (changedPaths.size > 0) {
    send({ paths: [...changedPaths], type: "data_changed" });
  }
  return { artifacts, executedToolNames, toolResults, wroteChanges };
};

// A pending plan superseded by a fresh user message counts as a denial of
// every item: nothing is ever applied without an explicit confirm (FR-7.8).
const denySupersededPlan = async (
  threadId: string,
  userId: string,
  plan: PendingPlan
): Promise<Anthropic.ToolResultBlockParam[]> => {
  // Independent single-row updates; denial order carries no meaning.
  await Promise.all(
    plan.items.map((item) =>
      resolveAuditedToolCall({
        confirmedBy: userId,
        status: "denied",
        threadId,
        toolUseId: item.toolUseId,
      })
    )
  );
  await clearThreadPending(threadId);
  return [
    ...plan.heldToolResults,
    ...plan.items.map(
      (item): Anthropic.ToolResultBlockParam => ({
        content:
          "The user moved on without confirming; the action was not applied.",
        tool_use_id: item.toolUseId,
        type: "tool_result",
      })
    ),
  ];
};

// A fresh user message: deny any superseded pending plan first, then
// assemble the page context, message text, and attachment refs.
const buildMessageContent = async (params: {
  body: ChatRequestBody;
  message: string;
  plan: PendingPlan | null;
  thread: ThreadRecord;
  userId: string;
  userName: string;
}): Promise<(Anthropic.ContentBlockParam | BluMediaBlock)[]> => {
  const { body, message, plan, thread, userId, userName } = params;
  const content: (Anthropic.ContentBlockParam | BluMediaBlock)[] = [];
  if (plan) {
    content.push(...(await denySupersededPlan(thread.id, userId, plan)));
  } else if (thread.status === "awaiting_confirmation") {
    // Unparseable pending blob: release the thread rather than leaving it
    // stuck awaiting a confirmation that can never resolve.
    await clearThreadPending(thread.id);
  }
  // Voice-note ids ride inside <page_context>: the audio never reaches the
  // model, so this line is its only way to learn the id log_activity needs.
  const voiceNoteIds = body.attachmentIds?.length
    ? await audioAttachmentIdsOf(body.attachmentIds, userId)
    : [];
  const pageContext = await buildPageContext(
    body.pageContext,
    userName,
    voiceNoteIds
  );
  content.push(
    { text: pageContext, type: "text" },
    { text: message, type: "text" }
  );
  if (body.attachmentIds?.length) {
    content.push(...(await buildMediaRefBlocks(body.attachmentIds, userId)));
    await linkAttachmentsToThread(body.attachmentIds, thread.id, userId);
  }
  return content;
};

// A Response body is single-use, so each rejection builds a fresh one.
const alreadyResolved = (): Response =>
  NextResponse.json(
    { error: "This action has already been resolved" },
    { status: 409 }
  );

// Validates a confirmation body against the live plan. Returns the
// normalized per-item decisions, or the rejection response to send.
const resolveDecisions = (
  confirmation: NonNullable<ChatRequestBody["confirmation"]>,
  plan: PendingPlan | null
): { decisions: ConfirmationDecision[] } | { response: Response } => {
  const decisions = normalizeDecisions(confirmation);
  if (!decisions) {
    return {
      response: NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      ),
    };
  }
  if (!plan) {
    return { response: alreadyResolved() };
  }
  const knownIds = new Set(plan.items.map((item) => item.toolUseId));
  if (decisions.some((decision) => !knownIds.has(decision.toolUseId))) {
    return { response: alreadyResolved() };
  }
  return { decisions };
};

// Regenerate pre-flight: rolls the thread back to its last plain user turn,
// or returns the rejection response when that is not possible.
const guardRegenerate = async (
  thread: ThreadRecord
): Promise<Response | null> => {
  if (thread.status === "awaiting_confirmation") {
    return NextResponse.json(
      { error: "Resolve the pending confirmation before regenerating" },
      { status: 409 }
    );
  }
  // Executed writes must never become re-runnable via regenerate; the
  // rollback refuses when the doomed turn changed data.
  const rollback = await rollbackToLastPlainUserTurn(thread.id);
  if (rollback === "conflict") {
    return NextResponse.json(
      { error: "This turn made changes and cannot be regenerated." },
      { status: 409 }
    );
  }
  if (rollback === "no_user_turn") {
    return NextResponse.json(
      { error: "Nothing to regenerate yet." },
      { status: 409 }
    );
  }
  return null;
};

// Edit + resubmit pre-flight (Assistant v3 Phase 4): rolls the thread back
// past its most recent plain user turn, deleting that turn too so the edited
// text replaces it. A pending plan is superseded exactly like a new message
// supersedes one (every item denied, FR-7.8), except the held tool_results
// are discarded because the proposal turn they answer is being deleted. The
// denial runs via rollbackForEdit's beforeDelete hook, after the conflict
// check has passed, so a rejected edit leaves the pending plan untouched and
// a crash between the denial and the delete is healed by retrying the edit.
const guardEdit = async (params: {
  plan: PendingPlan | null;
  thread: ThreadRecord;
  userId: string;
}): Promise<Response | null> => {
  const { plan, thread, userId } = params;
  const rollback = await rollbackForEdit(thread.id, async () => {
    if (plan) {
      await denySupersededPlan(thread.id, userId, plan);
    } else if (thread.status === "awaiting_confirmation") {
      // Unparseable pending blob: release the thread rather than leaving it
      // stuck (mirrors the new-message path in buildMessageContent).
      await clearThreadPending(thread.id);
    }
  });
  if (rollback === "conflict") {
    return NextResponse.json(
      {
        error:
          "This part of the conversation made changes and cannot be edited.",
      },
      { status: 409 }
    );
  }
  if (rollback === "no_user_turn") {
    return NextResponse.json(
      { error: "Nothing to edit yet." },
      { status: 400 }
    );
  }
  return null;
};

// Request-shape pre-flight: rejections that need no thread lookup. Returns
// null when the request may proceed.
const rejectBeforeThread = async (
  parsedBody: ChatRequestBody,
  userId: string
): Promise<Response | null> => {
  if (parsedBody.regenerate && !parsedBody.threadId) {
    return NextResponse.json(
      { error: "Regenerate requires a thread" },
      { status: 400 }
    );
  }
  if (parsedBody.editedMessage && !parsedBody.threadId) {
    return NextResponse.json(
      { error: "Editing requires a thread" },
      { status: 400 }
    );
  }
  // Checked before thread creation so an over-cap request never leaves an
  // empty thread behind.
  if ((await countMessagesToday(userId)) >= dailyMessageLimit()) {
    return NextResponse.json(
      {
        error:
          "Daily assistant limit reached. It resets at midnight UTC; contact an admin if you need more.",
      },
      { status: 429 }
    );
  }
  return null;
};

// The AI assistant chat endpoint (M4 / FR-7). Streams NDJSON payloads; the
// thread, messages, tool outcomes, and artifacts are persisted server-side so
// the conversation can resume across reloads. A POST carries a new user
// message, an edited replacement for the last user turn, the resolution of a
// pending write plan, or a regenerate request.
export async function POST(request: Request): Promise<Response> {
  const assistantUser = await resolveAssistantUser(request);
  if (!assistantUser) {
    return NextResponse.json(
      { error: "Sign in to use the assistant" },
      { status: 401 }
    );
  }

  // Graceful degradation: the rest of the CRM works without the assistant.
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "The AI assistant is not configured on this environment" },
      { status: 503 }
    );
  }

  let parsedBody: ChatRequestBody;
  try {
    parsedBody = chatRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = assistantUser.id;

  const preflightRejection = await rejectBeforeThread(parsedBody, userId);
  if (preflightRejection) {
    return preflightRejection;
  }

  const thread = parsedBody.threadId
    ? await getThreadForUser(parsedBody.threadId, userId)
    : await createThread(
        userId,
        {
          contactId: parsedBody.pageContext.contactId,
          dealId: parsedBody.pageContext.dealId,
          originPage: parsedBody.pageContext.pathname,
        },
        deriveTitle(parsedBody.message ?? "New conversation")
      );
  if (!thread) {
    return NextResponse.json({ error: "Unknown thread" }, { status: 404 });
  }

  const plan =
    thread.status === "awaiting_confirmation"
      ? parsePendingPlan(thread.pendingToolUse)
      : null;

  let decisions: ConfirmationDecision[] | null = null;
  if (parsedBody.confirmation) {
    const resolved = resolveDecisions(parsedBody.confirmation, plan);
    if ("response" in resolved) {
      return resolved.response;
    }
    decisions = resolved.decisions;
  }

  if (parsedBody.regenerate) {
    const rejection = await guardRegenerate(thread);
    if (rejection) {
      return rejection;
    }
  }

  if (parsedBody.editedMessage) {
    const rejection = await guardEdit({ plan, thread, userId });
    if (rejection) {
      return rejection;
    }
  }

  // An edit already rolled the thread back and resolved any pending plan in
  // guardEdit; from here it runs exactly like a new message carrying the
  // edited text.
  const messageText = parsedBody.editedMessage ?? parsedBody.message;
  const messagePlan = parsedBody.editedMessage ? null : plan;
  const messageThread: ThreadRecord = parsedBody.editedMessage
    ? { ...thread, pendingToolUse: null, status: "idle" }
    : thread;

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (payload: StreamPayload): void => {
    writer.write(encoder.encode(encodeStreamPayload(payload))).catch(() => {
      // Client went away mid-stream; the turn still completes server-side.
    });
  };

  // A turn only compacts after it fully succeeded; error turns change little
  // and must not delay their error payload with a summariser call.
  let turnSucceeded = false;

  const run = async (): Promise<void> => {
    try {
      send({ threadId: thread.id, type: "thread" });

      // Build the resume/user turn before invoking the loop. blu_media refs
      // are persisted alongside the text and rehydrated to base64 at replay.
      const userContent: (Anthropic.ContentBlockParam | BluMediaBlock)[] = [];
      let planArtifacts: ArtifactPayload[] = [];
      let turnActivity: TurnActivity | undefined;

      if (decisions && plan) {
        const executed = await executePendingPlan({
          decisions,
          plan,
          send,
          threadId: thread.id,
          userId,
        });
        // Cleared only after the whole plan loop: a crash mid-plan leaves the
        // per-item audit state behind and the plan still resolvable.
        await clearThreadPending(thread.id);
        userContent.push(...executed.toolResults);
        planArtifacts = executed.artifacts;
        // Seeds the loop's end-of-turn suggestions with what just executed.
        turnActivity = {
          artifactTypes: planArtifacts.map((artifact) => artifact.artifactType),
          toolsUsed: executed.executedToolNames,
          wroteChanges: executed.wroteChanges,
        };
      } else if (messageText) {
        userContent.push(
          ...(await buildMessageContent({
            body: parsedBody,
            message: messageText,
            plan: messagePlan,
            thread: messageThread,
            userId,
            userName: assistantUser.name,
          }))
        );
      }

      // Regenerate re-answers the surviving last user turn; it must not
      // append a new one (and so never counts against the daily cap).
      if (!parsedBody.regenerate) {
        const userMessageId = await appendThreadMessage(
          thread.id,
          "user",
          userContent
        );
        // Artifacts from executed plan writes anchor to this resume turn,
        // the message carrying their tool_results.
        await saveMessageArtifacts(thread.id, userMessageId, planArtifacts);
      }
      const messages = await loadThreadMessages(thread.id);

      const result = await runAgentTurn({
        ctx: { threadId: thread.id, userId },
        messages,
        send,
        turnActivity,
      });
      send({ messageId: result.lastAssistantMessageId, type: "done" });
      turnSucceeded = true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The assistant hit an unexpected error";
      send({ message, retryable: true, type: "error" });
    } finally {
      await writer.close().catch(() => {
        // Stream already closed by a disconnecting client.
      });
    }
  };
  // Post-turn bookkeeping, sequenced after run() closes the stream so it
  // never delays a byte of the reply: compaction summarises the older span of
  // long threads (maybeCompactThread no-ops below its thresholds and
  // swallows its own failures).
  const runThenCompact = async (): Promise<void> => {
    await run();
    if (turnSucceeded) {
      await maybeCompactThread(thread.id);
    }
  };
  // Tie the streamed turn to the request lifecycle. Without waitUntil, the
  // Workers runtime cancels the detached run() once it considers the
  // invocation ended, so long turns (model thinking + tool loop) are killed
  // mid-stream and the user sees no reply.
  const { ctx } = getCloudflareContext();
  ctx.waitUntil(
    runThenCompact().catch(() => {
      // run() and maybeCompactThread handle their own errors; nothing can
      // reach here.
    })
  );

  return new Response(readable, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  });
}
