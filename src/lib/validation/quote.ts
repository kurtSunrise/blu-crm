import { z } from "zod";

// Shared validation layer for the lightweight quote tracking (FR-6).

export const createQuoteSchema = z.object({
  dealId: z.string().min(1),
  valueDollars: z.coerce
    .number()
    .positive("Quote value must be positive")
    .max(100_000_000),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const sendQuoteSchema = z.object({
  quoteId: z.string().min(1),
});

export type SendQuoteInput = z.infer<typeof sendQuoteSchema>;

// Accepted / Declined are the only manual outcomes; Viewed is set by the
// tokenised public link (FR-6.2).
export const QUOTE_OUTCOMES = ["accepted", "declined"] as const;

export const updateQuoteStatusSchema = z.object({
  quoteId: z.string().min(1),
  status: z.enum(QUOTE_OUTCOMES),
});

export type UpdateQuoteStatusInput = z.infer<typeof updateQuoteStatusSchema>;
