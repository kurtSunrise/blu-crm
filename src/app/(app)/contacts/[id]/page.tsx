import { desc, eq, inArray, or } from "drizzle-orm";
import { Mail, MessageSquare, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveRecordButton } from "@/components/archive-record-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import {
  activity,
  company,
  contact,
  deal,
  pipelineStage,
  quote,
  user,
} from "@/db/schema";
import { archiveContact } from "@/lib/actions/contact-actions";
import {
  formatAudFromCents,
  formatDateAwst,
  formatDateTimeAwst,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 20;

const ACTIVITY_LABELS: Record<string, string> = {
  call: "Call",
  email: "Email",
  site_visit: "Site visit",
  meeting: "Meeting",
  note: "Note",
  stage_change: "Stage",
  quote_event: "Quote",
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
};

const quickActionClasses =
  "flex h-11 items-center gap-2 rounded-md border px-4 text-sm transition-colors hover:border-blu";

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
      companyId: contact.companyId,
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
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
      estimatedValueCents: deal.estimatedValueCents,
      quotedValueCents: deal.quotedValueCents,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(eq(deal.contactId, id))
    .orderBy(desc(deal.createdAt));

  const dealIds = linkedDeals.map((entry) => entry.id);
  // The unified history covers activities logged on the contact directly
  // plus everything on their deals (FR-2.2).
  const historyWhere =
    dealIds.length > 0
      ? or(eq(activity.contactId, id), inArray(activity.dealId, dealIds))
      : eq(activity.contactId, id);
  const [history, quotes] = await Promise.all([
    db
      .select({
        id: activity.id,
        type: activity.type,
        content: activity.content,
        createdAt: activity.createdAt,
        authorName: user.name,
        dealId: activity.dealId,
        dealTitle: deal.title,
      })
      .from(activity)
      .leftJoin(user, eq(activity.createdBy, user.id))
      .leftJoin(deal, eq(activity.dealId, deal.id))
      .where(historyWhere)
      .orderBy(desc(activity.createdAt))
      .limit(HISTORY_LIMIT),
    dealIds.length > 0
      ? db
          .select({
            id: quote.id,
            dealId: quote.dealId,
            dealTitle: deal.title,
            valueCents: quote.valueCents,
            status: quote.status,
            sentAt: quote.sentAt,
            viewedAt: quote.viewedAt,
          })
          .from(quote)
          .innerJoin(deal, eq(quote.dealId, deal.id))
          .where(inArray(quote.dealId, dealIds))
          .orderBy(desc(quote.createdAt))
      : Promise.resolve([]),
  ]);

  const openValueCents = linkedDeals
    .filter((entry) => !(entry.isWon || entry.isLost))
    .reduce(
      (total, entry) =>
        total + (entry.quotedValueCents ?? entry.estimatedValueCents ?? 0),
      0
    );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-6xl">
      <header className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          <Link className="underline-offset-2 hover:underline" href="/contacts">
            Contacts
          </Link>{" "}
          / Person
        </p>
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-tight">
            {person.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {[person.title, person.companyName].filter(Boolean).join(" · ") ||
              "No role or company recorded yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {person.phone && (
            <a className={quickActionClasses} href={`tel:${person.phone}`}>
              <Phone aria-hidden className="size-4 text-blu" />
              Call
            </a>
          )}
          {person.phone && (
            <a className={quickActionClasses} href={`sms:${person.phone}`}>
              <MessageSquare aria-hidden className="size-4 text-blu" />
              Text
            </a>
          )}
          {person.email && (
            <a className={quickActionClasses} href={`mailto:${person.email}`}>
              <Mail aria-hidden className="size-4 text-blu" />
              Email
            </a>
          )}
          <Link className={quickActionClasses} href={`/contacts/${id}/edit`}>
            <Pencil aria-hidden className="size-4 text-blu" />
            Edit
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-5">
          <section aria-label="Deals" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-heading font-medium text-sm">Deals</h2>
              {openValueCents > 0 && (
                <span className="text-muted-foreground text-xs">
                  {formatAudFromCents(openValueCents)} open
                </span>
              )}
            </div>
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

          <section aria-label="Quotes" className="flex flex-col gap-2">
            <h2 className="font-heading font-medium text-sm">Quotes</h2>
            {quotes.length === 0 && (
              <p className="text-muted-foreground text-sm">No quotes yet.</p>
            )}
            <ul className="flex flex-col gap-2">
              {quotes.map((item) => (
                <li key={item.id}>
                  <Link className="block" href={`/deals/${item.dealId}`}>
                    <Card className="py-3 transition-colors hover:border-blu">
                      <CardContent className="flex items-center justify-between gap-2 px-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-sm">
                            {item.dealTitle}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {item.sentAt
                              ? `Sent ${formatDateAwst(item.sentAt)}`
                              : "Not sent"}
                            {item.viewedAt
                              ? ` · Viewed ${formatDateAwst(item.viewedAt)}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {item.valueCents != null && (
                            <span className="text-sm">
                              {formatAudFromCents(item.valueCents)}
                            </span>
                          )}
                          <Badge variant="outline">
                            {QUOTE_STATUS_LABELS[item.status] ?? item.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-label="History"
            className="flex flex-col gap-3 lg:rounded-lg lg:border lg:bg-card/50 lg:p-4"
          >
            <h2 className="font-heading font-medium text-sm">History</h2>
            {history.length === 0 && (
              <p className="text-muted-foreground text-sm">No activity yet.</p>
            )}
            <ol className="flex flex-col gap-3">
              {history.map((entry) => (
                <li className="flex flex-col gap-0.5" key={entry.id}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {ACTIVITY_LABELS[entry.type] ?? entry.type}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTimeAwst(entry.createdAt)}
                      {entry.authorName ? ` · ${entry.authorName}` : ""}
                    </span>
                  </div>
                  {entry.content && <p className="text-sm">{entry.content}</p>}
                  {entry.dealTitle && (
                    <Link
                      className="w-fit text-blu text-xs underline-offset-2 hover:underline"
                      href={`/deals/${entry.dealId}`}
                    >
                      {entry.dealTitle}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section aria-label="Details" className="flex flex-col gap-3">
            <h2 className="font-heading font-medium text-sm">Details</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <div className="flex flex-col">
                <dt className="text-muted-foreground text-xs">Email</dt>
                <dd className="text-sm">
                  {person.email ? (
                    <a
                      className="text-blu underline-offset-2 hover:underline"
                      href={`mailto:${person.email}`}
                    >
                      {person.email}
                    </a>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted-foreground text-xs">Phone</dt>
                <dd className="text-sm">
                  {person.phone ? (
                    <a
                      className="text-blu underline-offset-2 hover:underline"
                      href={`tel:${person.phone}`}
                    >
                      {person.phone}
                    </a>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted-foreground text-xs">Role / title</dt>
                <dd className="text-sm">{person.title ?? "Not recorded"}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted-foreground text-xs">Company</dt>
                <dd className="text-sm">
                  {person.companyId && person.companyName ? (
                    <Link
                      className="text-blu underline-offset-2 hover:underline"
                      href={`/companies/${person.companyId}`}
                    >
                      {person.companyName}
                    </Link>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-label="Notes" className="flex flex-col gap-2">
            <h2 className="font-heading font-medium text-sm">Notes</h2>
            {person.notes ? (
              <p className="text-sm">{person.notes}</p>
            ) : (
              <p className="text-muted-foreground text-sm">
                No notes yet. Add them from Edit.
              </p>
            )}
          </section>

          <ArchiveRecordButton
            action={archiveContact.bind(null, person.id)}
            confirmCopy={`Archive ${person.name}? They leave contact lists and search, but their deals and history stay on record.`}
            triggerLabel="Archive contact"
          />
        </div>
      </div>
    </main>
  );
}
