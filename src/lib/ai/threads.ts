import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { chatMessage, chatThread, contact, deal } from "@/db/schema";
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

export interface ThreadContext {
  kind: "deal" | "contact";
  label: string;
}

// Hover-preview material for a history row (the assistant's equivalent of
// the pipeline card tooltip): how the conversation opened, the latest
// exchange, and its size.
export interface ThreadPreview {
  firstMessage: string | null;
  lastMessage: string | null;
  messageCount: number;
}

export interface ThreadListItem {
  context: ThreadContext | null;
  id: string;
  lastMessageAt: Date | null;
  originPage: string | null;
  preview: ThreadPreview;
  status: "idle" | "awaiting_confirmation";
  title: string | null;
}

// % and _ are LIKE wildcards; a literal search must not let them through.
const LIKE_SPECIALS = /[%_\\]/g;

const likePattern = (query: string): string =>
  `%${query.replaceAll(LIKE_SPECIALS, "\\$&")}%`;

const PREVIEW_MAX_CHARS = 140;

const previewSnippet = (content: unknown): string | null => {
  const text = displayTextFromContent(content).trim();
  if (!text) {
    return null;
  }
  return text.length > PREVIEW_MAX_CHARS
    ? `${text.slice(0, PREVIEW_MAX_CHARS)}…`
    : text;
};

// One preview per thread in three small indexed queries (DISTINCT ON for
// the first user turn and the latest turn, plus counts), run in parallel —
// per-thread queries or sequential awaits are what caused the deal-page 503s
// on workerd.
const previewsForThreads = async (
  threadIds: string[]
): Promise<Map<string, ThreadPreview>> => {
  if (threadIds.length === 0) {
    return new Map();
  }

  const [firstUserRows, lastRows, countRows] = await Promise.all([
    db
      .selectDistinctOn([chatMessage.threadId], {
        content: chatMessage.content,
        threadId: chatMessage.threadId,
      })
      .from(chatMessage)
      .where(
        and(
          inArray(chatMessage.threadId, threadIds),
          eq(chatMessage.role, "user")
        )
      )
      .orderBy(chatMessage.threadId, asc(chatMessage.createdAt)),
    db
      .selectDistinctOn([chatMessage.threadId], {
        content: chatMessage.content,
        threadId: chatMessage.threadId,
      })
      .from(chatMessage)
      .where(inArray(chatMessage.threadId, threadIds))
      .orderBy(chatMessage.threadId, desc(chatMessage.createdAt)),
    db
      .select({ messageCount: count(), threadId: chatMessage.threadId })
      .from(chatMessage)
      .where(inArray(chatMessage.threadId, threadIds))
      .groupBy(chatMessage.threadId),
  ]);

  const previews = new Map<string, ThreadPreview>();
  for (const id of threadIds) {
    previews.set(id, {
      firstMessage: null,
      lastMessage: null,
      messageCount: 0,
    });
  }
  for (const row of firstUserRows) {
    const preview = previews.get(row.threadId);
    if (preview) {
      preview.firstMessage = previewSnippet(row.content);
    }
  }
  for (const row of lastRows) {
    const preview = previews.get(row.threadId);
    if (preview) {
      preview.lastMessage = previewSnippet(row.content);
    }
  }
  for (const row of countRows) {
    const preview = previews.get(row.threadId);
    if (preview) {
      preview.messageCount = row.messageCount;
    }
  }
  return previews;
};

// Recent conversations for the history view, most recently active first.
// A search query matches the thread title and the linked deal (title or
// lead id) or contact name, over the user's whole history, not just the
// most recent page.
export const listThreadsForUser = async (
  userId: string,
  query?: string
): Promise<ThreadListItem[]> => {
  const conditions = [
    eq(chatThread.userId, userId),
    isNull(chatThread.archivedAt),
  ];
  const trimmed = query?.trim();
  if (trimmed) {
    const pattern = likePattern(trimmed);
    const searchCondition = or(
      ilike(chatThread.title, pattern),
      ilike(deal.title, pattern),
      ilike(deal.leadId, pattern),
      ilike(contact.name, pattern)
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const rows = await db
    .select({
      contactName: contact.name,
      dealLeadId: deal.leadId,
      dealTitle: deal.title,
      id: chatThread.id,
      lastMessageAt: chatThread.lastMessageAt,
      originPage: chatThread.originPage,
      status: chatThread.status,
      title: chatThread.title,
    })
    .from(chatThread)
    .leftJoin(deal, eq(chatThread.dealId, deal.id))
    .leftJoin(contact, eq(chatThread.contactId, contact.id))
    .where(and(...conditions))
    .orderBy(sql`${chatThread.lastMessageAt} desc nulls last`)
    .limit(THREAD_LIST_LIMIT);

  const previews = await previewsForThreads(rows.map((row) => row.id));
  const emptyPreview: ThreadPreview = {
    firstMessage: null,
    lastMessage: null,
    messageCount: 0,
  };

  return rows.map(({ contactName, dealLeadId, dealTitle, ...thread }) => {
    let context: ThreadContext | null = null;
    if (dealTitle) {
      // Same label shape as the composer's context chip.
      context = { kind: "deal", label: `${dealLeadId} · ${dealTitle}` };
    } else if (contactName) {
      context = { kind: "contact", label: contactName };
    }
    return {
      ...thread,
      context,
      preview: previews.get(thread.id) ?? emptyPreview,
    };
  });
};

export interface DisplayMessageAttachment {
  contentType: string;
  fileName: string;
  id: string;
}

export interface DisplayMessage {
  attachments: DisplayMessageAttachment[];
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
    if (
      isDisplayTextBlock(block) &&
      !block.text.startsWith(PAGE_CONTEXT_PREFIX)
    ) {
      parts.push(block.text);
    }
  }
  return parts.join("\n\n");
};

// The attachments carried by a persisted user turn, rebuilt from the
// `blu_media` references so the resumed conversation can re-render their chips.
const displayAttachmentsFromContent = (
  content: unknown
): DisplayMessageAttachment[] => {
  if (!Array.isArray(content)) {
    return [];
  }
  const attachments: DisplayMessageAttachment[] = [];
  for (const block of content) {
    if (isBluMediaBlock(block)) {
      attachments.push({
        contentType: block.contentType,
        fileName: block.fileName,
        id: block.attachmentId,
      });
    }
  }
  return attachments;
};

// The human-readable transcript for resuming a thread in the panel: text and
// attachment chips, oldest first. Page-context blocks, tool_use/tool_result
// plumbing, and confirmation round-trips are model-facing and stay out of the
// UI.
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
      attachments: displayAttachmentsFromContent(row.content),
      id: row.id,
      role: row.role,
      text: displayTextFromContent(row.content).trim(),
    }))
    .filter(
      (message) => message.text.length > 0 || message.attachments.length > 0
    );
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
