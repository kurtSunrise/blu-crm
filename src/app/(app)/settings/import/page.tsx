import { CsvImport } from "@/components/csv-import";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">CSV import</h1>
        <p className="text-muted-foreground text-sm">
          Bulk-load existing contacts or open deals from a spreadsheet export.
          Map the columns, check the preview, then import. Duplicate contacts
          are flagged before anything is created.
        </p>
      </header>
      <CsvImport />
    </main>
  );
}
