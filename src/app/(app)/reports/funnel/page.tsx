import { PageHeader } from "@/components/page-header";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportsNav } from "@/components/reports/reports-nav";
import { formatDateAwst } from "@/lib/format";
import {
  describeReportPeriod,
  getFunnelConversion,
  getReportOwners,
  getStageEventQuality,
  getStageVelocity,
  parseReportFilters,
  type ReportSearchParams,
  reportFilterParams,
  type StageVelocityRow,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PERCENT = 100;

const formatDays = (days: number | null): string => {
  if (days === null) {
    return "—";
  }
  if (days < 1) {
    return "< 1 day";
  }
  const rounded = Math.round(days * 10) / 10;
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
};

// The stage deals take longest to leave (needs at least one completed span).
const findBottleneckId = (velocity: StageVelocityRow[]): string | null => {
  let bottleneck: StageVelocityRow | null = null;
  for (const row of velocity) {
    if (row.completedCount === 0 || row.medianDays === null) {
      continue;
    }
    if (
      !bottleneck ||
      (bottleneck.medianDays !== null && row.medianDays > bottleneck.medianDays)
    ) {
      bottleneck = row;
    }
  }
  return bottleneck?.stageId ?? null;
};

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>;
}) {
  const filters = parseReportFilters(await searchParams);
  const periodLabel = describeReportPeriod(filters);
  const query = reportFilterParams(filters).toString();

  const [funnel, velocity, owners, quality] = await Promise.all([
    getFunnelConversion(filters),
    getStageVelocity(filters),
    getReportOwners(),
    getStageEventQuality(),
  ]);

  const maxReached = Math.max(
    ...funnel.steps.map((step) => step.reachedCount),
    1
  );
  const bottleneckId = findBottleneckId(velocity);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <PageHeader
        subtitle="How deals move through the stages: where they get stuck and where they fall away."
        title="Funnel"
      />

      <ReportsNav active="/reports/funnel" query={query} />
      <ReportFilters owners={owners} />

      <section aria-label="Stage funnel" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">
          Conversion — deals created {periodLabel}
        </h2>
        <p className="text-muted-foreground text-xs">
          {funnel.cohortCount} deal{funnel.cohortCount === 1 ? "" : "s"} in this
          cohort. A deal counts for a stage once it reaches that stage or any
          later one; Won is the finish line.
        </p>
        {funnel.cohortCount === 0 ? (
          <p className="text-muted-foreground text-sm">
            No deals were created in this period.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {funnel.steps.map((step) => (
              <li
                className="flex flex-col gap-1.5 rounded-lg border bg-card p-3"
                key={step.stageId ?? "won"}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium text-sm">
                    {step.stageName}
                    {step.conversionFromPrevious !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {step.conversionFromPrevious}% of previous
                      </span>
                    )}
                  </p>
                  <p className="shrink-0 text-sm">
                    {step.reachedCount}
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      ·{" "}
                      {funnel.cohortCount > 0
                        ? Math.round(
                            (step.reachedCount / funnel.cohortCount) * PERCENT
                          )
                        : 0}
                      % of cohort
                    </span>
                  </p>
                </div>
                <div
                  aria-hidden
                  className="h-1.5 overflow-hidden rounded-full bg-accent"
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      step.stageId === null ? "bg-success" : "bg-blu"
                    )}
                    style={{
                      width: `${Math.round((step.reachedCount / maxReached) * PERCENT)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Time in stage" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">Time in stage</h2>
        <p className="text-muted-foreground text-xs">
          Median time deals from this cohort spent in each stage before moving
          on, plus what is sitting there now.
        </p>
        {velocity.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No stage movement recorded for this cohort yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {velocity.map((row) => (
              <li
                className="flex flex-col gap-0.5 rounded-md border bg-card px-3 py-2"
                key={row.stageId}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 truncate font-medium text-sm">
                    <span className="truncate">{row.stageName}</span>
                    {row.stageId === bottleneckId && (
                      <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-xs dark:text-amber-400">
                        Bottleneck
                      </span>
                    )}
                  </p>
                  <p className="shrink-0 text-sm">
                    {formatDays(row.medianDays)}
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      median
                    </span>
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  {row.completedCount} moved on
                  {row.avgDays === null
                    ? ""
                    : ` (avg ${formatDays(row.avgDays)})`}
                  {row.currentCount > 0
                    ? ` · ${row.currentCount} here now${
                        row.currentAvgDays === null
                          ? ""
                          : ` for ${formatDays(row.currentAvgDays)} on average`
                      }`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {quality.hasBackfill && (
        <p className="text-muted-foreground text-xs">
          Stage history before{" "}
          {quality.firstLiveAt
            ? formatDateAwst(quality.firstLiveAt)
            : "July 2026"}{" "}
          was reconstructed from timeline notes and may be incomplete; numbers
          get more accurate from that date onward.
        </p>
      )}
    </main>
  );
}
