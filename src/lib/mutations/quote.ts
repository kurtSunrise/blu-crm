import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activity, quote } from "@/db/schema";
import { dollarsToCents, formatAudFromCents } from "@/lib/format";
import type { CreateQuoteInput } from "@/lib/validation/quote";

// Shared core used by both the quote form action and the AI create_quote
// tool (draft tracking only; quotes are built outside the CRM, FR-6).
// createdBy attributes the write (session user / confirming user).
export const createQuoteCore = async (
  input: CreateQuoteInput & { createdBy?: string }
): Promise<{ error?: string }> => {
  const valueCents = dollarsToCents(input.valueDollars);

  await db.insert(quote).values({
    createdBy: input.createdBy,
    dealId: input.dealId,
    valueCents,
  });
  await db.insert(activity).values({
    content: `Quote drafted at ${formatAudFromCents(valueCents)}`,
    createdBy: input.createdBy,
    dealId: input.dealId,
    type: "quote_event",
  });

  revalidatePath(`/deals/${input.dealId}`);
  // The board now reflects quoted values, so a new draft must refresh it too.
  revalidatePath("/pipeline");
  return {};
};
