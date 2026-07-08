import { eq, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { QuickAddForm } from "@/components/quick-add-form";
import { db } from "@/db";
import { company, contact, user } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function QuickAddPage() {
  const [owners, companies, contacts] = await Promise.all([
    db.select({ id: user.id, name: user.name }).from(user).orderBy(user.name),
    // Repeat clients are a core lead source; offer them as you type.
    db
      .select({ name: company.name })
      .from(company)
      .where(isNull(company.deletedAt))
      .orderBy(company.name),
    // Joined to company here so ContactField can auto-fill Client/brand on
    // selection without CompanyField needing to become id-aware.
    db
      .select({
        companyName: company.name,
        email: contact.email,
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
      })
      .from(contact)
      .leftJoin(company, eq(contact.companyId, company.id))
      .where(isNull(contact.deletedAt))
      .orderBy(contact.name),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4 md:py-6">
      <PageHeader
        subtitle="Capture a lead in under a minute. Client and one contact method are all that's required."
        title="Quick add"
      />
      <QuickAddForm
        companies={companies.map((entry) => entry.name)}
        contacts={contacts}
        owners={owners}
      />
    </main>
  );
}
