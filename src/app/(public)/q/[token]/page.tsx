import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { db } from "@/db";
import { activity, deal, quote } from "@/db/schema";
import { formatAudFromCents, formatDateAwst } from "@/lib/format";
import { emitNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Tokenised quote view (FR-6.2): exposes only this quote, never the CRM.
// The first open flips the quote to Viewed and alerts the deal owner.

const markViewed = async (
  quoteId: string,
  dealId: string,
  ownerId: string | null,
  dealTitle: string,
  valueCents: number | null
): Promise<void> => {
  await db
    .update(quote)
    .set({ status: "viewed", viewedAt: new Date(), updatedAt: new Date() })
    .where(eq(quote.id, quoteId));

  await db.insert(activity).values({
    dealId,
    type: "quote_event",
    content: "Quote viewed by the client",
  });

  if (ownerId) {
    await emitNotification({
      type: "quote_viewed",
      recipientIds: [ownerId],
      payload: { dealId, dealTitle, quoteId, valueCents },
    });
  }
};

export default async function QuoteViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [record] = await db
    .select({
      quoteId: quote.id,
      status: quote.status,
      valueCents: quote.valueCents,
      sentAt: quote.sentAt,
      dealId: deal.id,
      dealTitle: deal.title,
      ownerId: deal.ownerId,
    })
    .from(quote)
    .innerJoin(deal, eq(quote.dealId, deal.id))
    .where(eq(quote.viewToken, token))
    .limit(1);

  if (!record) {
    notFound();
  }

  if (record.status === "sent") {
    await markViewed(
      record.quoteId,
      record.dealId,
      record.ownerId,
      record.dealTitle,
      record.valueCents
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <BrandMark className="block" priority size={48} />
        <p className="font-medium text-blu text-sm uppercase tracking-widest">
          Blu Builders
        </p>
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          Your quote
        </h1>
      </header>
      <section
        aria-label="Quote summary"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <p className="text-muted-foreground text-sm">{record.dealTitle}</p>
        {record.valueCents != null && (
          <p className="font-semibold text-3xl">
            {formatAudFromCents(record.valueCents)}
          </p>
        )}
        {record.sentAt && (
          <p className="text-muted-foreground text-xs">
            Sent {formatDateAwst(record.sentAt)}
          </p>
        )}
      </section>
      <p className="text-muted-foreground text-sm">
        Questions, or ready to go ahead? Reply to the email this quote arrived
        with, or call us on (08) 6285 0231.
      </p>
      <footer className="text-muted-foreground text-xs">
        Private and Confidential · Blu.Builders Pty Ltd · Malaga, Western
        Australia
      </footer>
    </main>
  );
}
