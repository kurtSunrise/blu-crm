import { z } from "zod";

// Shared validation layer for the lightweight quote tracking (FR-6).

// Users paste prices straight from quotes/emails, e.g. "$12,500.00". Strip the
// currency symbol, thousands separators, and whitespace before coercing so a
// formatted paste is accepted instead of failing as NaN.
const CURRENCY_FORMATTING = /[$,\s]/g;

export const createQuoteSchema = z.object({
  dealId: z.string().min(1),
  valueDollars: z.preprocess(
    (value) =>
      typeof value === "string"
        ? value.replace(CURRENCY_FORMATTING, "")
        : value,
    z.coerce.number().positive("Quote value must be positive").max(100_000_000)
  ),
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
