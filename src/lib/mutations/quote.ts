import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activity, quote } from "@/db/schema";
import { dollarsToCents, formatAudFromCents } from "@/lib/format";
import type { CreateQuoteInput } from "@/lib/validation/quote";

// Shared core used by both the quote form action and the AI create_quote
// tool (draft tracking only; quotes are built outside the CRM, FR-6).
export const createQuoteCore = async (
  input: CreateQuoteInput
): Promise<{ error?: string }> => {
  const valueCents = dollarsToCents(input.valueDollars);

  await db.insert(quote).values({ dealId: input.dealId, valueCents });
  await db.insert(activity).values({
    content: `Quote drafted at ${formatAudFromCents(valueCents)}`,
    dealId: input.dealId,
    type: "quote_event",
  });

  revalidatePath(`/deals/${input.dealId}`);
  return {};
};
