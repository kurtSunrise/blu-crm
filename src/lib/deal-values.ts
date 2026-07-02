import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { quote } from "@/db/schema";

export interface DealValue {
  valueCents: number;
  valueRange: { maxCents: number; minCents: number } | null;
}

interface DealQuote {
  status: string;
  valueCents: number;
}

// Every quote with a value, grouped by deal, so a board or list can reflect a
// quote the moment it is drafted (FR-1.4) rather than only once it is accepted.
export const getQuotesByDeal = async (): Promise<Map<string, DealQuote[]>> => {
  const rows = await db
    .select({
      dealId: quote.dealId,
      status: quote.status,
      valueCents: quote.valueCents,
    })
    .from(quote)
    .where(isNotNull(quote.valueCents));

  const byDeal = new Map<string, DealQuote[]>();
  for (const row of rows) {
    if (row.valueCents == null) {
      continue;
    }
    const list = byDeal.get(row.dealId) ?? [];
    list.push({ status: row.status, valueCents: row.valueCents });
    byDeal.set(row.dealId, list);
  }
  return byDeal;
};

// The figure shown for a deal: an accepted quote wins; otherwise the live
// options (declined ones are off the table) collapse to a single value or a
// min-max range. The estimate (optionally itself a min/max range) is the
// fallback when nothing is quoted. Stage totals sum one number per deal, so a
// quoted range contributes its high end; an estimate range instead reports
// its low end, matching `estimatedValueCents` (the min) which every other
// read site sums directly.
export const computeDealValue = (
  quotes: DealQuote[],
  estimatedValueCents: number | null,
  estimatedValueMaxCents: number | null = null
): DealValue => {
  const accepted = quotes.find((item) => item.status === "accepted");
  if (accepted) {
    return { valueCents: accepted.valueCents, valueRange: null };
  }

  const openValues = quotes
    .filter((item) => item.status !== "declined")
    .map((item) => item.valueCents);
  if (openValues.length > 0) {
    const minCents = Math.min(...openValues);
    const maxCents = Math.max(...openValues);
    return {
      valueCents: maxCents,
      valueRange: minCents === maxCents ? null : { maxCents, minCents },
    };
  }

  const minCents = estimatedValueCents ?? 0;
  if (estimatedValueMaxCents != null && estimatedValueMaxCents > minCents) {
    return {
      valueCents: minCents,
      valueRange: { maxCents: estimatedValueMaxCents, minCents },
    };
  }
  return { valueCents: minCents, valueRange: null };
};
