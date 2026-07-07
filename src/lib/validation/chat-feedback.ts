import { z } from "zod";

// Body schema for POST /api/chat/feedback (Assistant v3 Phase 1): thumbs
// up/down on an assistant message, with an optional reason on downvotes.
// Shared validation layer per PRD §10: any future AI tool that records
// feedback must pass through this same schema.

export const FEEDBACK_COMMENT_MAX = 1000;

export const FEEDBACK_CATEGORIES = [
  "inaccurate",
  "not_relevant",
  "incomplete",
] as const;

export const chatFeedbackSchema = z
  .object({
    category: z.enum(FEEDBACK_CATEGORIES).optional(),
    comment: z
      .string()
      .trim()
      .max(FEEDBACK_COMMENT_MAX)
      .transform((value) => (value === "" ? undefined : value))
      .optional(),
    messageId: z.uuid(),
    rating: z.enum(["up", "down", "clear"]),
  })
  // Category and comment only mean something on a downvote; strip them
  // otherwise so an up/clear never smuggles stale reason text into the row.
  .transform((value) => ({
    category: value.rating === "down" ? value.category : undefined,
    comment: value.rating === "down" ? value.comment : undefined,
    messageId: value.messageId,
    rating: value.rating,
  }));

export type ChatFeedbackInput = z.infer<typeof chatFeedbackSchema>;
