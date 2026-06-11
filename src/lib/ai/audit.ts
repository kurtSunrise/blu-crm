import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiAuditLog } from "@/db/schema";

// Every AI-proposed mutation is logged through its full lifecycle:
// proposed → confirmed/denied → executed/failed (PRD §9.3 auditability).

export const recordProposedToolCall = async (params: {
  input: unknown;
  threadId: string;
  toolName: string;
  toolUseId: string;
  userId: string;
}): Promise<void> => {
  await db.insert(aiAuditLog).values({
    input: params.input,
    status: "proposed",
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
  status: "confirmed" | "denied" | "executed" | "failed";
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
