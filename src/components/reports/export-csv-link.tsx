import { Download } from "lucide-react";

// Plain anchor to the CSV export route — the server sets Content-Disposition,
// so the browser downloads rather than navigates. `query` carries the current
// filter set (and any drill-down params) so the file matches the screen.
export function ExportCsvLink({
  label = "Export CSV",
  query,
  report,
}: {
  label?: string;
  query?: string;
  report: "deals" | "forecast" | "pipeline" | "trends" | "winrate";
}) {
  const href = `/api/reports/export?report=${report}${query ? `&${query}` : ""}`;
  return (
    <a
      className="flex min-h-9 w-fit items-center gap-1.5 rounded-md border px-3 font-medium text-sm transition-colors hover:bg-accent"
      download
      href={href}
    >
      <Download aria-hidden className="size-4" />
      {label}
    </a>
  );
}
