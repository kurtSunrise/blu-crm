import { desc, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db";
import { activity, company, contact, deal, pipelineStage } from "@/db/schema";
import { formatAudFromCents, formatDateTimeAwst } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [person] = await db
    .select({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      title: contact.title,
      notes: contact.notes,
      companyName: company.name,
    })
    .from(contact)
    .leftJoin(company, eq(contact.companyId, company.id))
    .where(eq(contact.id, id))
    .limit(1);

  if (!person) {
    notFound();
  }

  const linkedDeals = await db
    .select({
      id: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      stageName: pipelineStage.name,
      estimatedValueCents: deal.estimatedValueCents,
      quotedValueCents: deal.quotedValueCents,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(eq(deal.contactId, id))
    .orderBy(desc(deal.createdAt));

  const dealIds = linkedDeals.map((entry) => entry.id);
  const history =
    dealIds.length > 0
      ? await db
          .select({
            id: activity.id,
            type: activity.type,
            content: activity.content,
            createdAt: activity.createdAt,
          })
          .from(activity)
          .where(
            or(eq(activity.contactId, id), inArray(activity.dealId, dealIds))
          )
          .orderBy(desc(activity.createdAt))
          .limit(20)
      : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{person.name}</h1>
        <p className="text-muted-foreground text-sm">
          {[person.title, person.companyName, person.email, person.phone]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <section aria-label="Deals" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm">Deals</h2>
        {linkedDeals.length === 0 && (
          <p className="text-muted-foreground text-sm">No deals yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {linkedDeals.map((entry) => {
            const valueCents =
              entry.quotedValueCents ?? entry.estimatedValueCents;
            return (
              <li key={entry.id}>
                <Link className="block" href={`/deals/${entry.id}`}>
                  <Card className="py-3 transition-colors hover:border-blu">
                    <CardContent className="flex items-center justify-between gap-2 px-4">
                      <div className="min-w-0">
                        <p className="font-mono text-muted-foreground text-xs">
                          {entry.leadId}
                        </p>
                        <p className="truncate font-medium text-sm">
                          {entry.title}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {valueCents != null && (
                          <span className="text-sm">
                            {formatAudFromCents(valueCents)}
                          </span>
                        )}
                        <Badge variant="secondary">{entry.stageName}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <Separator />

      <section aria-label="History" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm">History</h2>
        {history.length === 0 && (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        )}
        <ol className="flex flex-col gap-2">
          {history.map((entry) => (
            <li className="text-sm" key={entry.id}>
              <span className="text-muted-foreground text-xs">
                {formatDateTimeAwst(entry.createdAt)} ·{" "}
              </span>
              {entry.content ?? entry.type}
            </li>
          ))}
        </ol>
      </section>

      {person.notes && (
        <section aria-label="Notes" className="flex flex-col gap-2">
          <h2 className="font-heading font-medium text-sm">Notes</h2>
          <p className="text-sm">{person.notes}</p>
        </section>
      )}
    </main>
  );
}
