"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activity, deal, quote } from "@/db/schema";
import { dollarsToCents, formatAudFromCents } from "@/lib/format";
import {
  createQuoteSchema,
  sendQuoteSchema,
  updateQuoteStatusSchema,
} from "@/lib/validation/quote";

export interface QuoteActionState {
  error?: string;
}

export const createQuote = async (
  _prevState: QuoteActionState,
  formData: FormData
): Promise<QuoteActionState> => {
  const parsed = createQuoteSchema.safeParse({
    dealId: formData.get("dealId"),
    valueDollars: formData.get("valueDollars"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid quote" };
  }

  const { dealId, valueDollars } = parsed.data;
  const valueCents = dollarsToCents(valueDollars);

  await db.insert(quote).values({ dealId, valueCents });
  await db.insert(activity).values({
    dealId,
    type: "quote_event",
    content: `Quote drafted at ${formatAudFromCents(valueCents)}`,
  });

  revalidatePath(`/deals/${dealId}`);
  return {};
};

export const sendQuote = async (input: unknown): Promise<QuoteActionState> => {
  const parsed = sendQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid quote" };
  }

  // Tokenised per recipient; the link exposes only the quote (FR-6.2 AC).
  const [sent] = await db
    .update(quote)
    .set({
      status: "sent",
      sentAt: new Date(),
      viewToken: crypto.randomUUID(),
      updatedAt: new Date(),
    })
    .where(eq(quote.id, parsed.data.quoteId))
    .returning({ dealId: quote.dealId, valueCents: quote.valueCents });

  if (!sent) {
    return { error: "Unknown quote" };
  }

  await db.insert(activity).values({
    dealId: sent.dealId,
    type: "quote_event",
    content: `Quote sent${sent.valueCents == null ? "" : ` at ${formatAudFromCents(sent.valueCents)}`}`,
  });

  revalidatePath(`/deals/${sent.dealId}`);
  return {};
};

const OUTCOME_LABELS = { accepted: "accepted", declined: "declined" } as const;

export const updateQuoteStatus = async (
  input: unknown
): Promise<QuoteActionState> => {
  const parsed = updateQuoteStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid quote outcome" };
  }
  const { quoteId, status } = parsed.data;

  const [updated] = await db
    .update(quote)
    .set({ status, updatedAt: new Date() })
    .where(eq(quote.id, quoteId))
    .returning({ dealId: quote.dealId, valueCents: quote.valueCents });

  if (!updated) {
    return { error: "Unknown quote" };
  }

  // An accepted quote's value rolls into the deal and stage totals (FR-6.1).
  if (status === "accepted" && updated.valueCents != null) {
    await db
      .update(deal)
      .set({ quotedValueCents: updated.valueCents, updatedAt: new Date() })
      .where(eq(deal.id, updated.dealId));
  }

  await db.insert(activity).values({
    dealId: updated.dealId,
    type: "quote_event",
    content: `Quote ${OUTCOME_LABELS[status]}${updated.valueCents == null ? "" : ` at ${formatAudFromCents(updated.valueCents)}`}`,
  });

  revalidatePath(`/deals/${updated.dealId}`);
  revalidatePath("/pipeline");
  return {};
};
