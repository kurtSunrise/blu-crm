import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ExportCsvLink } from "@/components/reports/export-csv-link";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportsNav } from "@/components/reports/reports-nav";
import { formatAudFromCents, formatDateAwst } from "@/lib/format";
import { LEAD_SOURCE_LABELS } from "@/lib/labels";
import {
  describeReportPeriod,
  getReportDeals,
  getReportOwners,
  getStageName,
  parseReportFilters,
  type ReportSearchParams,
  reportFilterParams,
} from "@/lib/reports";
import { getSubStatusById } from "@/lib/sub-statuses";

export const dynamic = "force-dynamic";

interface DealsSearchParams extends ReportSearchParams {
  open?: string;
  outcome?: string;
  stage?: string;
  subStatus?: string;
}

// Human heading for the slice being viewed, most specific label first.
const resolveScopeLabel = (scope: {
  filters: Parameters<typeof describeReportPeriod>[0];
  open: boolean;
  outcome?: "lost" | "won";
  stageName: string | null;
  subStatusLabel: string | null;
}): string => {
  if (scope.stageName) {
    return scope.stageName;
  }
  if (scope.subStatusLabel) {
    return scope.subStatusLabel;
  }
  if (scope.outcome === "won") {
    return `Won — ${describeReportPeriod(scope.filters)}`;
  }
  if (scope.outcome === "lost") {
    return `Lost / dormant — ${describeReportPeriod(scope.filters)}`;
  }
  if (scope.open) {
    return "Open pipeline";
  }
  return "All deals";
};

export default async function ReportDealsPage({
  searchParams,
}: {
  searchParams: Promise<DealsSearchParams>;
}) {
  const params = await searchParams;
  const filters = parseReportFilters(params);
  const stageId = params.stage || undefined;
  const subStatusId = params.subStatus || undefined;
  const outcome =
    params.outcome === "won" || params.outcome === "lost"
      ? params.outcome
      : undefined;
  const open = params.open === "1";

  const [deals, owners, stageName, subStatus] = await Promise.all([
    getReportDeals({ filters, open, outcome, stageId, subStatusId }),
    getReportOwners(),
    stageId ? getStageName(stageId) : Promise.resolve(null),
    subStatusId ? getSubStatusById(subStatusId) : Promise.resolve(null),
  ]);

  const totalCents = deals.reduce((sum, row) => sum + row.valueCents, 0);

  const scopeLabel = resolveScopeLabel({
    filters,
    open,
    outcome,
    stageName,
    subStatusLabel: subStatus?.label ?? null,
  });

  const qualifiers: string[] = [];
  if (filters.ownerId) {
    const owner = owners.find((row) => row.id === filters.ownerId);
    qualifiers.push(`owned by ${owner?.name ?? "unknown"}`);
  }
  if (filters.source) {
    qualifiers.push(`from ${LEAD_SOURCE_LABELS[filters.source]}`);
  }

  const backHref = `/reports?${reportFilterParams(filters).toString()}`;

  // The export must carry the drill-down params too, not just the filters.
  const exportParams = reportFilterParams(filters);
  if (stageId) {
    exportParams.set("stage", stageId);
  }
  if (subStatusId) {
    exportParams.set("subStatus", subStatusId);
  }
  if (outcome) {
    exportParams.set("outcome", outcome);
  }
  if (open) {
    exportParams.set("open", "1");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-4 md:gap-6 md:py-6 lg:max-w-5xl">
      <PageHeader
        actions={
          <ExportCsvLink query={exportParams.toString()} report="deals" />
        }
        backHref={backHref}
        backLabel="Back to reports"
        subtitle={`${deals.length} deal${deals.length === 1 ? "" : "s"}${
          qualifiers.length > 0 ? ` ${qualifiers.join(", ")}` : ""
        } · ${formatAudFromCents(totalCents)}`}
        title={scopeLabel}
      />

      <ReportsNav query={reportFilterParams(filters).toString()} />
      <ReportFilters owners={owners} />

      {deals.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No deals match this view.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {deals.map((row) => (
            <li key={row.id}>
              <Link
                className="flex flex-col gap-0.5 rounded-md border bg-card px-3 py-2 transition-colors hover:border-blu/50 hover:bg-accent"
                href={`/deals/${row.id}`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-sm">
                    {row.leadId} · {row.title}
                  </span>
                  <span className="shrink-0 text-sm">
                    {formatAudFromCents(row.valueCents)}
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-3 text-muted-foreground text-xs">
                  <span className="min-w-0 truncate">
                    {row.companyName ?? "No company"} · {row.stageName}
                    {row.ownerName ? ` · ${row.ownerName}` : ""}
                  </span>
                  <span className="shrink-0">
                    {row.closedAt
                      ? `Closed ${formatDateAwst(row.closedAt)}`
                      : `Added ${formatDateAwst(row.createdAt)}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
