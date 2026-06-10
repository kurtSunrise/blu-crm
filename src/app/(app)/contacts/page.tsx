import { eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { company, contact } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const people = await db
    .select({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      companyName: company.name,
    })
    .from(contact)
    .leftJoin(company, eq(contact.companyId, company.id))
    .where(isNull(contact.deletedAt))
    .orderBy(contact.name);

  const companies = await db
    .select({ id: company.id, name: company.name, kind: company.kind })
    .from(company)
    .where(isNull(company.deletedAt))
    .orderBy(company.name);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <header className="flex items-center justify-between gap-2">
        <h1 className="font-semibold text-2xl tracking-tight">Contacts</h1>
        <Button render={<Link href="/contacts/new">Add contact</Link>} />
      </header>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-10">
        <section aria-label="People" className="flex flex-col gap-2">
          <h2 className="font-heading font-medium text-muted-foreground text-sm uppercase tracking-wide">
            People
          </h2>
          {people.length === 0 && (
            <p className="text-muted-foreground text-sm">No contacts yet.</p>
          )}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {people.map((person) => (
              <li key={person.id}>
                <Link className="block" href={`/contacts/${person.id}`}>
                  <Card className="py-3 transition-colors hover:border-blu">
                    <CardContent className="px-4">
                      <p className="font-medium text-sm">{person.name}</p>
                      <p className="truncate text-muted-foreground text-xs">
                        {[person.companyName, person.email, person.phone]
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

        <section aria-label="Companies" className="flex flex-col gap-2">
          <h2 className="font-heading font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Companies
          </h2>
          {companies.length === 0 && (
            <p className="text-muted-foreground text-sm">No companies yet.</p>
          )}
          <ul className="flex flex-col gap-1">
            {companies.map((entry) => (
              <li
                className="rounded-md border px-4 py-3 text-sm"
                key={entry.id}
              >
                {entry.name}
                {entry.kind && (
                  <span className="text-muted-foreground"> · {entry.kind}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
