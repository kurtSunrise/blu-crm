import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiAuditLog } from "@/db/schema";

// Every AI-proposed mutation is logged through its full lifecycle:
// proposed → confirmed/denied → executed/failed, or skipped when an earlier
// plan step failed (PRD §9.3 auditability).

export const recordProposedToolCall = async (params: {
  input: unknown;
  // The assistant chat_message carrying the tool_use block; anchors the
  // confirmation card when the thread is resumed
  messageId: string;
  threadId: string;
  toolName: string;
  toolUseId: string;
  userId: string;
}): Promise<void> => {
  await db.insert(aiAuditLog).values({
    input: params.input,
    messageId: params.messageId,
    status: "proposed",
    threadId: params.threadId,
    toolName: params.toolName,
    toolUseId: params.toolUseId,
    userId: params.userId,
  });
};

// For inline-executed tools (save_memory): the write happens without a
// confirmation round-trip, so one row lands directly as "executed".
// messageId is optional because AiToolContext does not carry it (the
// assistant chat_message does not exist yet while tools run mid-turn);
// inline rows anchor to the thread only.
export const recordExecutedToolCall = async (params: {
  input: unknown;
  messageId?: string;
  result?: unknown;
  threadId: string;
  toolName: string;
  toolUseId: string;
  userId: string;
}): Promise<void> => {
  await db.insert(aiAuditLog).values({
    input: params.input,
    messageId: params.messageId ?? null,
    resolvedAt: new Date(),
    result: params.result,
    status: "executed",
    threadId: params.threadId,
    toolName: params.toolName,
    toolUseId: params.toolUseId,
    userId: params.userId,
  });
};

export const resolveAuditedToolCall = async (params: {
  confirmedBy?: string;
  error?: string;
  finalInput?: unknown;
  result?: unknown;
  status: "confirmed" | "denied" | "executed" | "failed" | "skipped";
  threadId: string;
  toolUseId: string;
}): Promise<void> => {
  await db
    .update(aiAuditLog)
    .set({
      confirmedBy: params.confirmedBy,
      error: params.error,
      finalInput: params.finalInput,
      resolvedAt: new Date(),
      result: params.result,
      status: params.status,
    })
    .where(
      and(
        eq(aiAuditLog.threadId, params.threadId),
        eq(aiAuditLog.toolUseId, params.toolUseId)
      )
    );
};
