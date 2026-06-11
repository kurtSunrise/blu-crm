import { and, desc, eq, isNull } from "drizzle-orm";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveRecordButton } from "@/components/archive-record-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { company, contact, deal, pipelineStage } from "@/db/schema";
import { archiveCompany } from "@/lib/actions/company-actions";
import { formatAudFromCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [record] = await db
    .select({
      id: company.id,
      name: company.name,
      kind: company.kind,
      website: company.website,
      notes: company.notes,
    })
    .from(company)
    .where(eq(company.id, id))
    .limit(1);

  if (!record) {
    notFound();
  }

  const [people, deals] = await Promise.all([
    db
      .select({
        id: contact.id,
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
      })
      .from(contact)
      .where(and(eq(contact.companyId, id), isNull(contact.deletedAt)))
      .orderBy(contact.name),
    db
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
      .where(and(eq(deal.companyId, id), isNull(deal.deletedAt)))
      .orderBy(desc(deal.createdAt)),
  ]);

  const dealValue = (entry: (typeof deals)[number]): number =>
    entry.quotedValueCents ?? entry.estimatedValueCents ?? 0;
  const openDeals = deals.filter((entry) => !(entry.isWon || entry.isLost));
  const openValueCents = openDeals.reduce(
    (total, entry) => total + dealValue(entry),
    0
  );
  const wonValueCents = deals
    .filter((entry) => entry.isWon)
    .reduce((total, entry) => total + dealValue(entry), 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          <Link className="underline-offset-2 hover:underline" href="/contacts">
            Contacts
          </Link>{" "}
          / Company
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-2xl tracking-tight">
            {record.name}
          </h1>
          {record.kind && <Badge variant="outline">{record.kind}</Badge>}
        </div>
        {record.website && (
          <a
            className="w-fit text-blu text-sm underline underline-offset-2"
            href={record.website}
            rel="noopener noreferrer"
            target="_blank"
          >
            {record.website}
          </a>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            className="flex h-11 items-center gap-2 rounded-md border px-4 text-sm transition-colors hover:border-blu"
            href={`/companies/${id}/edit`}
          >
            <Pencil aria-hidden className="size-4 text-blu" />
            Edit
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
          <span className="font-semibold text-lg">{openDeals.length}</span>
          <span className="text-muted-foreground text-xs">Open deals</span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
          <span className="font-semibold text-lg">
            {formatAudFromCents(openValueCents)}
          </span>
          <span className="text-muted-foreground text-xs">Open pipeline</span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
          <span className="font-semibold text-lg">
            {formatAudFromCents(wonValueCents)}
          </span>
          <span className="text-muted-foreground text-xs">Won to date</span>
        </div>
      </div>

      <section aria-label="People" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm">People</h2>
        {people.length === 0 && (
          <p className="text-muted-foreground text-sm">No contacts yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <li key={person.id}>
              <Link className="block" href={`/contacts/${person.id}`}>
                <Card className="py-3 transition-colors hover:border-blu">
                  <CardContent className="px-4">
                    <p className="font-medium text-sm">{person.name}</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {[person.title, person.email, person.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Deals" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm">Deals</h2>
        {deals.length === 0 && (
          <p className="text-muted-foreground text-sm">No deals yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {deals.map((entry) => (
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
                      <span className="text-sm">
                        {formatAudFromCents(dealValue(entry))}
                      </span>
                      <Badge variant="secondary">{entry.stageName}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {record.notes && (
        <section aria-label="Notes" className="flex flex-col gap-2">
          <h2 className="font-heading font-medium text-sm">Notes</h2>
          <p className="text-sm">{record.notes}</p>
        </section>
      )}

      <ArchiveRecordButton
        action={archiveCompany.bind(null, record.id)}
        confirmCopy={`Archive ${record.name}? It leaves the directory, but its people, deals, and history stay on record.`}
        triggerLabel="Archive company"
      />
    </main>
  );
}
