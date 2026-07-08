import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ContactEditForm } from "@/components/contact-edit-form";
import { db } from "@/db";
import { company, contact } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [[person], companies] = await Promise.all([
    db
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
      .where(and(eq(contact.id, id), isNull(contact.deletedAt)))
      .limit(1),
    db
      .select({ name: company.name })
      .from(company)
      .where(isNull(company.deletedAt))
      .orderBy(company.name),
  ]);

  if (!person) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4 md:py-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Edit contact</h1>
        <p className="text-muted-foreground text-sm">
          Changes apply everywhere this person appears; their deals and history
          stay linked.
        </p>
      </header>
      <ContactEditForm
        companies={companies.map((entry) => entry.name)}
        contact={{
          id: person.id,
          name: person.name,
          email: person.email ?? "",
          phone: person.phone ?? "",
          title: person.title ?? "",
          companyName: person.companyName ?? "",
          notes: person.notes ?? "",
        }}
      />
    </main>
  );
}
