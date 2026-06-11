import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessage, chatThread } from "@/db/schema";

// Replay cap (least-context): only the tail of long threads goes back to the
// model. Trimming must land on a plain user turn so tool_use blocks keep
// their paired tool_result.
const REPLAY_MESSAGE_CAP = 40;

export type ThreadRecord = typeof chatThread.$inferSelect;

export interface ThreadOrigin {
  contactId?: string;
  dealId?: string;
  originPage: string;
}

export const getThreadForUser = async (
  threadId: string,
  userId: string
): Promise<ThreadRecord | null> => {
  const rows = await db
    .select()
    .from(chatThread)
    .where(and(eq(chatThread.id, threadId), eq(chatThread.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
};

export const createThread = async (
  userId: string,
  origin: ThreadOrigin,
  title: string
): Promise<ThreadRecord> => {
  const rows = await db
    .insert(chatThread)
    .values({
      contactId: origin.contactId,
      dealId: origin.dealId,
      originPage: origin.originPage,
      title,
      userId,
    })
    .returning();
  const thread = rows[0];
  if (!thread) {
    throw new Error("Failed to create chat thread");
  }
  return thread;
};

export const appendThreadMessage = async (
  threadId: string,
  role: "user" | "assistant",
  content: unknown
): Promise<string> => {
  const rows = await db
    .insert(chatMessage)
    .values({ content, role, threadId })
    .returning({ id: chatMessage.id });
  await db
    .update(chatThread)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(chatThread.id, threadId));
  const inserted = rows[0];
  if (!inserted) {
    throw new Error("Failed to persist chat message");
  }
  return inserted.id;
};

// What the loop parks on the thread while a write tool awaits the user's
// decision (FR-7.8). heldToolResults carries results for any read tools
// from the same assistant turn so the resume message answers every
// tool_use block at once.
export interface PendingToolUse {
  heldToolResults: Anthropic.ToolResultBlockParam[];
  input: unknown;
  summary: string;
  toolName: string;
  toolUseId: string;
}

export const setThreadPending = async (
  threadId: string,
  pending: PendingToolUse
): Promise<void> => {
  await db
    .update(chatThread)
    .set({
      pendingToolUse: pending,
      status: "awaiting_confirmation",
      updatedAt: new Date(),
    })
    .where(eq(chatThread.id, threadId));
};

export const clearThreadPending = async (threadId: string): Promise<void> => {
  await db
    .update(chatThread)
    .set({ pendingToolUse: null, status: "idle", updatedAt: new Date() })
    .where(eq(chatThread.id, threadId));
};

const isPlainUserTurn = (message: Anthropic.MessageParam): boolean => {
  if (message.role !== "user") {
    return false;
  }
  if (typeof message.content === "string") {
    return true;
  }
  return message.content.every((block) => block.type !== "tool_result");
};

// Returns the replayable history, oldest first, trimmed to start on a fresh
// user turn so the Anthropic message constraints hold.
export const loadThreadMessages = async (
  threadId: string
): Promise<Anthropic.MessageParam[]> => {
  const rows = await db
    .select({ content: chatMessage.content, role: chatMessage.role })
    .from(chatMessage)
    .where(eq(chatMessage.threadId, threadId))
    .orderBy(desc(chatMessage.createdAt))
    .limit(REPLAY_MESSAGE_CAP);

  const messages = rows.reverse().map(
    (row) =>
      ({
        content: row.content as Anthropic.MessageParam["content"],
        role: row.role,
      }) as Anthropic.MessageParam
  );

  const firstPlainUserTurn = messages.findIndex(isPlainUserTurn);
  return firstPlainUserTurn <= 0
    ? messages
    : messages.slice(firstPlainUserTurn);
};
