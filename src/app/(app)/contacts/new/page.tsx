import { isNull } from "drizzle-orm";
import { ContactForm } from "@/components/contact-form";
import { db } from "@/db";
import { company } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  // "Add person" on a company page lands here with the company prefilled.
  const { company: defaultCompanyName } = await searchParams;
  const companies = await db
    .select({ name: company.name })
    .from(company)
    .where(isNull(company.deletedAt))
    .orderBy(company.name);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4 md:py-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Add contact</h1>
        <p className="text-muted-foreground text-sm">
          We&apos;ll warn you if this person looks like an existing contact —
          repeat clients are common.
        </p>
      </header>
      <ContactForm
        companies={companies.map((entry) => entry.name)}
        defaultCompanyName={defaultCompanyName ?? ""}
      />
    </main>
  );
}
