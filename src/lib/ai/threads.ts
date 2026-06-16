import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatMessage, chatThread } from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";
import {
  isBluMediaBlock,
  rehydrateMediaInMessages,
} from "@/lib/ai/attachments";

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

const THREAD_LIST_LIMIT = 30;

export interface ThreadListItem {
  id: string;
  lastMessageAt: Date | null;
  originPage: string | null;
  status: "idle" | "awaiting_confirmation";
  title: string | null;
}

// Recent conversations for the history view, most recently active first.
export const listThreadsForUser = async (
  userId: string
): Promise<ThreadListItem[]> =>
  db
    .select({
      id: chatThread.id,
      lastMessageAt: chatThread.lastMessageAt,
      originPage: chatThread.originPage,
      status: chatThread.status,
      title: chatThread.title,
    })
    .from(chatThread)
    .where(and(eq(chatThread.userId, userId), isNull(chatThread.archivedAt)))
    .orderBy(sql`${chatThread.lastMessageAt} desc nulls last`)
    .limit(THREAD_LIST_LIMIT);

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const PAGE_CONTEXT_PREFIX = "<page_context>";

const isDisplayTextBlock = (
  block: unknown
): block is { text: string; type: "text" } =>
  typeof block === "object" &&
  block !== null &&
  (block as { type?: string }).type === "text" &&
  typeof (block as { text?: unknown }).text === "string";

const displayTextFromContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (isBluMediaBlock(block)) {
      parts.push(`📎 ${block.fileName}`);
      continue;
    }
    if (
      isDisplayTextBlock(block) &&
      !block.text.startsWith(PAGE_CONTEXT_PREFIX)
    ) {
      parts.push(block.text);
    }
  }
  return parts.join("\n\n");
};

// The human-readable transcript for resuming a thread in the panel: text
// only, oldest first. Page-context blocks, tool_use/tool_result plumbing,
// and confirmation round-trips are model-facing and stay out of the UI.
export const loadThreadDisplayMessages = async (
  threadId: string
): Promise<DisplayMessage[]> => {
  const rows = await db
    .select({
      content: chatMessage.content,
      id: chatMessage.id,
      role: chatMessage.role,
    })
    .from(chatMessage)
    .where(eq(chatMessage.threadId, threadId))
    .orderBy(asc(chatMessage.createdAt));

  return rows
    .map((row) => ({
      id: row.id,
      role: row.role,
      text: displayTextFromContent(row.content).trim(),
    }))
    .filter((message) => message.text.length > 0);
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
  const trimmed =
    firstPlainUserTurn <= 0 ? messages : messages.slice(firstPlainUserTurn);
  return rehydrateMediaInMessages(trimmed);
};
