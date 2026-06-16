import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentTurn } from "@/lib/ai/agent-loop";
import type * as Anthropic from "@/lib/ai/anthropic";
import { resolveAssistantUser } from "@/lib/ai/assistant-user";
import {
  type BluMediaBlock,
  buildMediaRefBlocks,
  linkAttachmentsToThread,
} from "@/lib/ai/attachments";
import { resolveAuditedToolCall } from "@/lib/ai/audit";
import { isAiConfigured } from "@/lib/ai/client";
import { buildPageContext } from "@/lib/ai/page-context";
import {
  encodeStreamPayload,
  type StreamPayload,
} from "@/lib/ai/stream-protocol";
import {
  appendThreadMessage,
  clearThreadPending,
  createThread,
  getThreadForUser,
  loadThreadMessages,
  type PendingToolUse,
  type ThreadRecord,
} from "@/lib/ai/threads";
import { executeToolCall } from "@/lib/ai/tools";

const TITLE_MAX_LENGTH = 60;

const MAX_CHAT_ATTACHMENTS = 5;

const chatRequestSchema = z
  .object({
    // Ids from /api/chat/attachments; rehydrated to base64 media blocks when
    // the thread history is sent to the model.
    attachmentIds: z.array(z.string()).max(MAX_CHAT_ATTACHMENTS).optional(),
    confirmation: z
      .object({
        approved: z.boolean(),
        // User-edited tool input from the confirmation card (two-way sync);
        // re-validated by the tool's own zod schema at execution time
        finalInput: z.unknown().optional(),
        toolUseId: z.string(),
      })
      .optional(),
    message: z.string().min(1).optional(),
    pageContext: z.object({
      contactId: z.string().optional(),
      dealId: z.string().optional(),
      pathname: z.string(),
    }),
    threadId: z.string().optional(),
  })
  .refine((value) => Boolean(value.message) || Boolean(value.confirmation), {
    message: "Provide a message or a confirmation",
  });

type ChatRequestBody = z.infer<typeof chatRequestSchema>;

const deriveTitle = (message: string): string => {
  const collapsed = message.replaceAll(/\s+/g, " ").trim();
  return collapsed.length > TITLE_MAX_LENGTH
    ? `${collapsed.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : collapsed;
};

const getPending = (thread: ThreadRecord): PendingToolUse | null =>
  thread.status === "awaiting_confirmation" && thread.pendingToolUse
    ? (thread.pendingToolUse as PendingToolUse)
    : null;

// Resolve the pending gated write: execute (approved) or decline (denied),
// audit the lifecycle, and return the tool_result blocks that answer every
// tool_use of the paused assistant turn.
const resolvePendingToolUse = async (params: {
  approved: boolean;
  finalInput?: unknown;
  pending: PendingToolUse;
  send: (payload: StreamPayload) => void;
  threadId: string;
  userId: string;
}): Promise<Anthropic.ToolResultBlockParam[]> => {
  const { approved, pending, send, threadId, userId } = params;
  const effectiveInput = params.finalInput ?? pending.input;

  if (!approved) {
    await resolveAuditedToolCall({
      confirmedBy: userId,
      status: "denied",
      threadId,
      toolUseId: pending.toolUseId,
    });
    return [
      ...pending.heldToolResults,
      {
        content:
          "The user declined this action. Nothing was changed. Acknowledge briefly and ask how they would like to proceed.",
        tool_use_id: pending.toolUseId,
        type: "tool_result",
      },
    ];
  }

  await resolveAuditedToolCall({
    confirmedBy: userId,
    finalInput: effectiveInput,
    status: "confirmed",
    threadId,
    toolUseId: pending.toolUseId,
  });

  send({
    toolName: pending.toolName,
    toolUseId: pending.toolUseId,
    type: "tool_start",
  });
  const outcome = await executeToolCall(pending.toolName, effectiveInput, {
    threadId,
    userId,
  });
  send({
    toolName: pending.toolName,
    toolUseId: pending.toolUseId,
    type: "tool_done",
  });

  await resolveAuditedToolCall({
    confirmedBy: userId,
    error: outcome.isError ? outcome.resultText : undefined,
    finalInput: effectiveInput,
    result: outcome.isError ? undefined : { resultText: outcome.resultText },
    status: outcome.isError ? "failed" : "executed",
    threadId,
    toolUseId: pending.toolUseId,
  });

  for (const artifact of outcome.artifacts ?? []) {
    send(artifact);
  }
  if (!outcome.isError && outcome.changedPaths) {
    send({ paths: outcome.changedPaths, type: "data_changed" });
  }

  return [
    ...pending.heldToolResults,
    {
      content: outcome.resultText,
      is_error: outcome.isError,
      tool_use_id: pending.toolUseId,
      type: "tool_result",
    },
  ];
};

// A pending write superseded by a fresh user message counts as a denial:
// nothing is ever applied without an explicit confirm (FR-7.8).
const denySupersededToolUse = async (
  threadId: string,
  userId: string,
  pending: PendingToolUse
): Promise<Anthropic.ToolResultBlockParam[]> => {
  await resolveAuditedToolCall({
    confirmedBy: userId,
    status: "denied",
    threadId,
    toolUseId: pending.toolUseId,
  });
  await clearThreadPending(threadId);
  return [
    ...pending.heldToolResults,
    {
      content:
        "The user moved on without confirming; the action was not applied.",
      tool_use_id: pending.toolUseId,
      type: "tool_result",
    },
  ];
};

// The AI assistant chat endpoint (M4 / FR-7). Streams NDJSON payloads; the
// thread, messages, and tool outcomes are persisted server-side so the
// conversation can resume across reloads. A POST carries either a new user
// message or the resolution of a pending write confirmation.
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

  const pending = getPending(thread);
  const confirmation = parsedBody.confirmation;
  if (confirmation && pending?.toolUseId !== confirmation.toolUseId) {
    return NextResponse.json(
      { error: "This action has already been resolved" },
      { status: 409 }
    );
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (payload: StreamPayload): void => {
    writer.write(encoder.encode(encodeStreamPayload(payload))).catch(() => {
      // Client went away mid-stream; the turn still completes server-side.
    });
  };

  const run = async (): Promise<void> => {
    try {
      send({ threadId: thread.id, type: "thread" });

      // Build the resume/user turn before invoking the loop. blu_media refs
      // are persisted alongside the text and rehydrated to base64 at replay.
      const userContent: (Anthropic.ContentBlockParam | BluMediaBlock)[] = [];

      if (confirmation && pending) {
        const toolResults = await resolvePendingToolUse({
          approved: confirmation.approved,
          finalInput: confirmation.finalInput,
          pending,
          send,
          threadId: thread.id,
          userId,
        });
        await clearThreadPending(thread.id);
        userContent.push(...toolResults);
      } else if (parsedBody.message) {
        if (pending) {
          userContent.push(
            ...(await denySupersededToolUse(thread.id, userId, pending))
          );
        }
        const pageContext = await buildPageContext(
          parsedBody.pageContext,
          assistantUser.name
        );
        userContent.push(
          { text: pageContext, type: "text" },
          { text: parsedBody.message, type: "text" }
        );
        if (parsedBody.attachmentIds?.length) {
          userContent.push(
            ...(await buildMediaRefBlocks(parsedBody.attachmentIds))
          );
          await linkAttachmentsToThread(parsedBody.attachmentIds, thread.id);
        }
      }

      await appendThreadMessage(thread.id, "user", userContent);
      const messages = await loadThreadMessages(thread.id);

      await runAgentTurn({
        ctx: { threadId: thread.id, userId },
        messages,
        send,
      });
      send({ messageId: null, type: "done" });
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
  run().catch(() => {
    // run() handles its own errors; nothing can reach here.
  });

  return new Response(readable, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
    },
  });
}
