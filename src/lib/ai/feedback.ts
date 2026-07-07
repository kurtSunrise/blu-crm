import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatFeedback, chatMessage, chatThread } from "@/db/schema";

// Per-message thumbs feedback on assistant replies (Assistant v3 Phase 1).
// Ratings are owned by the thread owner: every write verifies the message
// belongs to a thread of the acting user, mirroring getThreadForUser.

export type FeedbackRating = "down" | "up";

// Matches the transcript display cap (DISPLAY_MESSAGE_LIMIT in threads.ts):
// there is never more feedback to show than messages on screen.
const THREAD_FEEDBACK_LIMIT = 500;

// The thread a message belongs to, but only when that thread is owned by
// userId (join chat_message -> chat_thread, same ownership rule as threads.ts).
const ownedThreadIdForMessage = async (
  messageId: string,
  userId: string
): Promise<string | null> => {
  const rows = await db
    .select({ threadId: chatMessage.threadId })
    .from(chatMessage)
    .innerJoin(chatThread, eq(chatMessage.threadId, chatThread.id))
    .where(and(eq(chatMessage.id, messageId), eq(chatThread.userId, userId)))
    .limit(1);
  return rows[0]?.threadId ?? null;
};

export interface UpsertFeedbackInput {
  category?: string;
  comment?: string;
  messageId: string;
  rating: FeedbackRating | "clear";
  userId: string;
}

export type UpsertFeedbackResult = "not_found" | "ok";

// Records (or replaces) the user's rating for a message in one statement via
// the (message_id, user_id) unique index. rating "clear" removes the row
// instead, so the table only holds live ratings.
export const upsertMessageFeedback = async (
  input: UpsertFeedbackInput
): Promise<UpsertFeedbackResult> => {
  const threadId = await ownedThreadIdForMessage(input.messageId, input.userId);
  if (!threadId) {
    return "not_found";
  }

  if (input.rating === "clear") {
    await db
      .delete(chatFeedback)
      .where(
        and(
          eq(chatFeedback.messageId, input.messageId),
          eq(chatFeedback.userId, input.userId)
        )
      );
    return "ok";
  }

  await db
    .insert(chatFeedback)
    .values({
      category: input.category ?? null,
      comment: input.comment ?? null,
      messageId: input.messageId,
      rating: input.rating,
      threadId,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      set: {
        category: sql`excluded.category`,
        comment: sql`excluded.comment`,
        rating: sql`excluded.rating`,
        updatedAt: new Date(),
      },
      target: [chatFeedback.messageId, chatFeedback.userId],
    });
  return "ok";
};

// The user's own ratings for one thread, for re-painting thumbs on resume.
export const listThreadFeedback = async (
  userId: string,
  threadId: string
): Promise<Array<{ messageId: string; rating: FeedbackRating }>> =>
  db
    .select({ messageId: chatFeedback.messageId, rating: chatFeedback.rating })
    .from(chatFeedback)
    .where(
      and(eq(chatFeedback.threadId, threadId), eq(chatFeedback.userId, userId))
    )
    .limit(THREAD_FEEDBACK_LIMIT);

// All-time thumbs totals across every user, for the assistant analytics view.
export const getFeedbackSummary = async (): Promise<{
  down: number;
  up: number;
}> => {
  const rows = await db
    .select({ rating: chatFeedback.rating, total: count() })
    .from(chatFeedback)
    .groupBy(chatFeedback.rating);
  const summary = { down: 0, up: 0 };
  for (const row of rows) {
    summary[row.rating] = row.total;
  }
  return summary;
};
