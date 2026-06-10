import { QuickAddForm } from "@/components/quick-add-form";
import { db } from "@/db";
import { user } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function QuickAddPage() {
  const owners = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(user.name);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Quick add</h1>
        <p className="text-muted-foreground text-sm">
          Capture a lead in under a minute. Client and one contact method are
          all that&apos;s required.
        </p>
      </header>
      <QuickAddForm owners={owners} />
    </main>
  );
}
