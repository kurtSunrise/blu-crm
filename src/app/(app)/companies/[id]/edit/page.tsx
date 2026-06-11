import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CompanyEditForm } from "@/components/company-edit-form";
import { db } from "@/db";
import { company } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function EditCompanyPage({
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
    .where(and(eq(company.id, id), isNull(company.deletedAt)))
    .limit(1);

  if (!record) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Edit company</h1>
        <p className="text-muted-foreground text-sm">
          Changes apply everywhere this company appears; its people, deals, and
          history stay linked.
        </p>
      </header>
      <CompanyEditForm
        company={{
          id: record.id,
          name: record.name,
          kind: record.kind ?? "",
          website: record.website ?? "",
          notes: record.notes ?? "",
        }}
      />
    </main>
  );
}
