import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { ContactsDirectory } from "@/components/contacts-directory";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { company, contact, deal, pipelineStage } from "@/db/schema";

export const metadata = {
  title: "Contacts | Blu CRM",
};

export const dynamic = "force-dynamic";

// Deal value follows FR-1.4: quoted value wins over the estimate.
const openDealCount = sql<number>`count(${deal.id}) filter (where not (${pipelineStage.isWon} or ${pipelineStage.isLost}))::int`;
const openDealValue = sql<number>`coalesce(sum(coalesce(${deal.quotedValueCents}, ${deal.estimatedValueCents}, 0)) filter (where not (${pipelineStage.isWon} or ${pipelineStage.isLost})), 0)::int`;

export default async function ContactsPage() {
  const [people, companyRows, companyPeople, companyDeals] = await Promise.all([
    db
      .select({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        title: contact.title,
        companyName: company.name,
        openDeals: openDealCount,
        openValueCents: openDealValue,
      })
      .from(contact)
      .leftJoin(company, eq(contact.companyId, company.id))
      .leftJoin(
        deal,
        and(eq(deal.contactId, contact.id), isNull(deal.deletedAt))
      )
      .leftJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .where(isNull(contact.deletedAt))
      .groupBy(contact.id, company.name)
      .orderBy(contact.name),
    db
      .select({ id: company.id, name: company.name, kind: company.kind })
      .from(company)
      .where(isNull(company.deletedAt))
      .orderBy(company.name),
    db
      .select({ companyId: contact.companyId, value: count(contact.id) })
      .from(contact)
      .where(and(isNull(contact.deletedAt), isNotNull(contact.companyId)))
      .groupBy(contact.companyId),
    db
      .select({ companyId: deal.companyId, openValueCents: openDealValue })
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .where(and(isNull(deal.deletedAt), isNotNull(deal.companyId)))
      .groupBy(deal.companyId),
  ]);

  const peopleByCompany = new Map(
    companyPeople.map((row) => [row.companyId, row.value])
  );
  const valueByCompany = new Map(
    companyDeals.map((row) => [row.companyId, row.openValueCents])
  );
  const companies = companyRows.map((entry) => ({
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    peopleCount: peopleByCompany.get(entry.id) ?? 0,
    openValueCents: valueByCompany.get(entry.id) ?? 0,
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-blu text-xs uppercase tracking-widest">
            Blu Builders · The Creative Build Company
          </p>
          <h1 className="font-semibold text-2xl tracking-tight">Contacts</h1>
          <p className="text-muted-foreground text-sm">
            {people.length} people across {companies.length} companies, with
            every deal and conversation one tap away.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="h-11"
            nativeButton={false}
            render={<Link href="/settings/import">CSV import</Link>}
            variant="outline"
          />
          <Button
            className="h-11"
            nativeButton={false}
            render={<Link href="/contacts/new">Add contact</Link>}
          />
        </div>
      </header>

      <ContactsDirectory companies={companies} people={people} />
    </main>
  );
}
