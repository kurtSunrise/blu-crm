import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  aiAuditLog,
  chatMessage,
  chatThread,
  contact,
  deal,
} from "@/db/schema";
import type * as Anthropic from "@/lib/ai/anthropic";
import {
  loadArtifactsForThread,
  type StoredArtifact,
} from "@/lib/ai/artifact-store";
import {
  isBluMediaBlock,
  rehydrateMediaInMessages,
} from "@/lib/ai/attachments";
import { summarizeToolCall } from "@/lib/ai/tools";

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

// What the loop parks on the thread while gated writes await the user's
// decision (FR-7.8). Items keep the proposal order of the assistant turn's
// write tool_use blocks; heldToolResults carries results for any read tools
// from the same turn so the resume message answers every tool_use block at
// once.
export interface PendingPlanItem {
  input: unknown;
  summary: string;
  toolName: string;
  toolUseId: string;
}

export interface PendingPlan {
  heldToolResults: Anthropic.ToolResultBlockParam[];
  items: PendingPlanItem[];
  version: 2;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPlanItem = (value: unknown): value is PendingPlanItem =>
  isRecord(value) &&
  typeof value.summary === "string" &&
  typeof value.toolName === "string" &&
  typeof value.toolUseId === "string";

const heldResultsFrom = (raw: unknown): Anthropic.ToolResultBlockParam[] =>
  Array.isArray(raw) ? (raw as Anthropic.ToolResultBlockParam[]) : [];

// Reads a stored pendingToolUse blob as a v2 plan. The legacy single-item
// shape ({toolUseId, toolName, input, summary, heldToolResults}) written
// before multi-step plans wraps into a one-item plan, so an in-flight
// confirmation survives the deploy that introduced plans.
export const parsePendingPlan = (raw: unknown): PendingPlan | null => {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.version === 2) {
    const items = Array.isArray(raw.items) ? raw.items.filter(isPlanItem) : [];
    if (items.length === 0) {
      return null;
    }
    return {
      heldToolResults: heldResultsFrom(raw.heldToolResults),
      items,
      version: 2,
    };
  }
  if (isPlanItem(raw)) {
    return {
      heldToolResults: heldResultsFrom(raw.heldToolResults),
      items: [
        {
          input: raw.input,
          summary: raw.summary,
          toolName: raw.toolName,
          toolUseId: raw.toolUseId,
        },
      ],
      version: 2,
    };
  }
  return null;
};

export const setThreadPending = async (
  threadId: string,
  pending: PendingPlan
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

// Rename and pin/unpin from the history view. Callers verify ownership via
// getThreadForUser first.
export const updateThreadSettings = async (
  threadId: string,
  updates: { pinned?: boolean; title?: string }
): Promise<void> => {
  const set: Partial<typeof chatThread.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (updates.title !== undefined) {
    set.title = updates.title;
  }
  if (updates.pinned !== undefined) {
    set.pinnedAt = updates.pinned ? new Date() : null;
  }
  await db.update(chatThread).set(set).where(eq(chatThread.id, threadId));
};

// Soft delete: archived threads drop out of listThreadsForUser but keep
// their messages and audit trail.
export const archiveThread = async (threadId: string): Promise<void> => {
  await db
    .update(chatThread)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
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
  pinned: boolean;
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
      pinnedAt: chatThread.pinnedAt,
      status: chatThread.status,
      title: chatThread.title,
    })
    .from(chatThread)
    .leftJoin(deal, eq(chatThread.dealId, deal.id))
    .leftJoin(contact, eq(chatThread.contactId, contact.id))
    .where(and(...conditions))
    .orderBy(
      sql`${chatThread.pinnedAt} desc nulls last`,
      sql`${chatThread.lastMessageAt} desc nulls last`
    )
    .limit(THREAD_LIST_LIMIT);

  const previews = await previewsForThreads(rows.map((row) => row.id));
  const emptyPreview: ThreadPreview = {
    firstMessage: null,
    lastMessage: null,
    messageCount: 0,
  };

  return rows.map(
    ({ contactName, dealLeadId, dealTitle, pinnedAt, ...thread }) => {
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
        pinned: pinnedAt !== null,
        preview: previews.get(thread.id) ?? emptyPreview,
      };
    }
  );
};

export interface DisplayMessageAttachment {
  contentType: string;
  fileName: string;
  id: string;
}

// Rich transcript parts rebuilt on resume: artifact cards from chat_artifact
// and confirmation cards from the audit trail.
export type ConfirmationPartStatus =
  | "approved"
  | "denied"
  | "failed"
  | "pending"
  | "skipped"
  | "unresolved";

export type DisplayMessagePart =
  | { artifactType: string; data: unknown; type: "artifact" }
  | {
      input: unknown;
      status: ConfirmationPartStatus;
      summary: string;
      toolName: string;
      toolUseId: string;
      type: "confirmation";
    };

export interface DisplayMessage {
  attachments: DisplayMessageAttachment[];
  id: string;
  parts: DisplayMessagePart[];
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

// Defensive caps: the newest rows win when a thread is pathological.
const DISPLAY_MESSAGE_LIMIT = 500;
const DISPLAY_AUDIT_LIMIT = 200;

const confirmationStatusFor = (
  auditStatus: string,
  toolUseId: string,
  pendingIds: Set<string>
): ConfirmationPartStatus => {
  switch (auditStatus) {
    case "confirmed":
    case "executed":
      return "approved";
    case "denied":
      return "denied";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    default:
      // Still "proposed": actionable only while the live plan holds it;
      // otherwise the row was orphaned (e.g. a crash before resolution).
      return pendingIds.has(toolUseId) ? "pending" : "unresolved";
  }
};

// The human-readable transcript for resuming a thread in the panel: text,
// attachment chips, and rebuilt artifact/confirmation cards, oldest first.
// Page-context blocks and tool_use/tool_result plumbing are model-facing and
// stay out of the UI. pendingPlan (the live plan when awaiting confirmation)
// marks its proposals as actionable.
export const loadThreadDisplayMessages = async (
  threadId: string,
  pendingPlan: PendingPlan | null
): Promise<DisplayMessage[]> => {
  // Independent reads fan out together; sequential Neon awaits in one render
  // are what caused the deal-page 503s on workerd.
  const [rows, artifacts, auditRows] = await Promise.all([
    db
      .select({
        content: chatMessage.content,
        id: chatMessage.id,
        role: chatMessage.role,
      })
      .from(chatMessage)
      .where(eq(chatMessage.threadId, threadId))
      .orderBy(desc(chatMessage.createdAt))
      .limit(DISPLAY_MESSAGE_LIMIT),
    loadArtifactsForThread(threadId),
    db
      .select({
        finalInput: aiAuditLog.finalInput,
        input: aiAuditLog.input,
        messageId: aiAuditLog.messageId,
        status: aiAuditLog.status,
        toolName: aiAuditLog.toolName,
        toolUseId: aiAuditLog.toolUseId,
      })
      .from(aiAuditLog)
      .where(eq(aiAuditLog.threadId, threadId))
      .orderBy(asc(aiAuditLog.createdAt))
      .limit(DISPLAY_AUDIT_LIMIT),
  ]);
  rows.reverse();

  const artifactsByMessage = new Map<string, StoredArtifact[]>();
  for (const artifact of artifacts) {
    const group = artifactsByMessage.get(artifact.messageId);
    if (group) {
      group.push(artifact);
    } else {
      artifactsByMessage.set(artifact.messageId, [artifact]);
    }
  }

  const auditByMessage = new Map<string, typeof auditRows>();
  for (const row of auditRows) {
    // Rows predating the messageId column cannot be anchored; those threads
    // simply stay text-only.
    if (!row.messageId) {
      continue;
    }
    const group = auditByMessage.get(row.messageId);
    if (group) {
      group.push(row);
    } else {
      auditByMessage.set(row.messageId, [row]);
    }
  }

  const pendingIds = new Set(
    pendingPlan?.items.map((item) => item.toolUseId) ?? []
  );

  return rows
    .map((row) => {
      const parts: DisplayMessagePart[] = [];
      for (const artifact of artifactsByMessage.get(row.id) ?? []) {
        parts.push({
          artifactType: artifact.artifactType,
          data: artifact.data,
          type: "artifact",
        });
      }
      for (const audit of auditByMessage.get(row.id) ?? []) {
        parts.push({
          input: audit.finalInput ?? audit.input,
          status: confirmationStatusFor(
            audit.status,
            audit.toolUseId,
            pendingIds
          ),
          summary: summarizeToolCall(audit.toolName),
          toolName: audit.toolName,
          toolUseId: audit.toolUseId,
          type: "confirmation",
        });
      }
      return {
        attachments: displayAttachmentsFromContent(row.content),
        id: row.id,
        parts,
        role: row.role,
        text: displayTextFromContent(row.content).trim(),
      };
    })
    .filter(
      (message) =>
        message.text.length > 0 ||
        message.attachments.length > 0 ||
        message.parts.length > 0
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

export type RollbackResult = "ok" | "conflict" | "no_user_turn";

// Regenerate support: delete everything newer than the thread's most recent
// plain user turn so the loop can re-answer it. Refuses ("conflict") when any
// audit row in the doomed window reached executed or failed: the 2026-07-03
// work log deliberately kept executed writes out of regenerate, since
// re-running a turn that changed data would create double-write ambiguity.
export const rollbackToLastPlainUserTurn = async (
  threadId: string
): Promise<RollbackResult> => {
  // The anchor must sit inside the replay window anyway, so scanning the
  // newest REPLAY_MESSAGE_CAP rows is sufficient.
  const rows = await db
    .select({
      content: chatMessage.content,
      createdAt: chatMessage.createdAt,
      id: chatMessage.id,
      role: chatMessage.role,
    })
    .from(chatMessage)
    .where(eq(chatMessage.threadId, threadId))
    .orderBy(desc(chatMessage.createdAt))
    .limit(REPLAY_MESSAGE_CAP);

  const anchorIndex = rows.findIndex((row) =>
    isPlainUserTurn({
      content: row.content as Anthropic.MessageParam["content"],
      role: row.role,
    } as Anthropic.MessageParam)
  );
  if (anchorIndex < 0) {
    return "no_user_turn";
  }
  const anchor = rows[anchorIndex];
  const doomedIds = rows.slice(0, anchorIndex).map((row) => row.id);

  // Guard: executed or failed writes anchored to a doomed message, or logged
  // after the anchor turn, make the rollback unsafe.
  const guards = [gt(aiAuditLog.createdAt, anchor.createdAt)];
  if (doomedIds.length > 0) {
    guards.push(inArray(aiAuditLog.messageId, doomedIds));
  }
  const executed = await db
    .select({ id: aiAuditLog.id })
    .from(aiAuditLog)
    .where(
      and(
        eq(aiAuditLog.threadId, threadId),
        inArray(aiAuditLog.status, ["executed", "failed"]),
        or(...guards)
      )
    )
    .limit(1);
  if (executed.length > 0) {
    return "conflict";
  }

  if (doomedIds.length > 0) {
    // One atomic statement; chat_artifact rows cascade via their messageId FK.
    await db.delete(chatMessage).where(inArray(chatMessage.id, doomedIds));
  }
  return "ok";
};
