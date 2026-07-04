import Link from "next/link";
import { ContactsDirectory } from "@/components/contacts-directory";
import { Button } from "@/components/ui/button";
import { getContactsDirectoryData } from "@/lib/contacts-directory-data";

export const metadata = {
  title: "Contacts | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { people, companies } = await getContactsDirectoryData();

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
