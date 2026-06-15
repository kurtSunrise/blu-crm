import { CsvImport } from "@/components/csv-import";

export const dynamic = "force-dynamic";

// The page heading comes from the settings shell layout; this tab adds its own
// explainer and the importer itself.
export default function ImportPage() {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-muted-foreground text-sm">
        Bulk-load existing contacts or open deals from a spreadsheet export. Map
        the columns, check the preview, then import. Duplicate contacts are
        flagged before anything is created.
      </p>
      <CsvImport />
    </div>
  );
}
