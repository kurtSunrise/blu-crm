import Link from "next/link";
import { AlertThresholdsForm } from "@/components/alert-thresholds-form";
import { getAlertThresholds } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const thresholds = await getAlertThresholds();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Alert thresholds apply to everyone. Role-based access arrives with
          sign-in.
        </p>
      </header>
      <section aria-label="Alert thresholds" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">Alerts</h2>
        <AlertThresholdsForm
          closingSoonDays={thresholds.closingSoonDays}
          staleDays={thresholds.staleDays}
        />
      </section>
      <section aria-label="Data" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">Data</h2>
        <Link
          className="flex min-h-12 w-fit items-center rounded-md border px-4 text-sm transition-colors hover:border-blu"
          href="/settings/import"
        >
          CSV import (contacts and open deals)
        </Link>
      </section>
    </main>
  );
}
