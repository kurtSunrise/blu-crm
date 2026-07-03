import Link from "next/link";
import { ExportCsvLink } from "@/components/reports/export-csv-link";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportsNav } from "@/components/reports/reports-nav";
import { formatAudFromCents } from "@/lib/format";
import { subStatusClasses } from "@/lib/labels";
import {
  describeReportPeriod,
  getActivityVolume,
  getReportOwners,
  getStageBreakdown,
  getSubStatusBreakdown,
  getWinRate,
  parseReportFilters,
  type ReportSearchParams,
  reportFilterParams,
  summarisePipeline,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function StatCard({
  href,
  label,
  value,
}: {
  href?: string;
  label: string;
  value: string;
}) {
  const body = (
    <>
      <span className="font-semibold text-2xl">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link
        className="flex flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:border-blu/50 hover:bg-accent"
        href={href}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      {body}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>;
}) {
  const filters = parseReportFilters(await searchParams);
  const periodLabel = describeReportPeriod(filters);
  const query = reportFilterParams(filters).toString();

  const drillHref = (extra: Record<string, string>): string => {
    const params = reportFilterParams(filters);
    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }
    return `/reports/deals?${params.toString()}`;
  };

  // Independent report queries run in one parallel batch instead of
  // sequential Neon round-trips.
  const [breakdown, winRate, activityVolume, subStatusBreakdown, owners] =
    await Promise.all([
      getStageBreakdown(filters),
      getWinRate(filters.from, filters),
      getActivityVolume(filters.from, filters),
      getSubStatusBreakdown(filters),
      getReportOwners(),
    ]);
  const totals = summarisePipeline(breakdown);

  const openStages = breakdown.filter((row) => !(row.isWon || row.isLost));
  const maxStageCents = Math.max(...openStages.map((row) => row.totalCents), 1);

  const onHoldCount = subStatusBreakdown.reduce(
    (sum, row) => sum + row.dealCount,
    0
  );
  const onHoldTotalCents = subStatusBreakdown.reduce(
    (sum, row) => sum + row.totalCents,
    0
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">
            Pipeline value, forecast, and win rate — the same numbers the weekly
            report uses. Tap any figure to see the deals behind it.
          </p>
        </div>
        <ExportCsvLink query={query} report="pipeline" />
      </header>

      <ReportsNav active="/reports" query={query} />
      <ReportFilters owners={owners} />

      <section aria-label="Pipeline overview" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">Pipeline overview</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            href={drillHref({ open: "1" })}
            label="Open pipeline"
            value={formatAudFromCents(totals.openTotalCents)}
          />
          <StatCard
            href={drillHref({ open: "1" })}
            label="Open deals"
            value={String(totals.openCount)}
          />
          <StatCard
            label="Weighted forecast"
            value={formatAudFromCents(totals.weightedTotalCents)}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Forecast weights each stage's value by its win likelihood — weightings
          are editable in Settings.
        </p>
        <ul className="flex flex-col gap-2">
          {openStages.map((stage) => (
            <li key={stage.stageId}>
              <Link
                className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 transition-colors hover:border-blu/50 hover:bg-accent"
                href={drillHref({ stage: stage.stageId })}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium text-sm">
                    {stage.stageName}
                    <span className="text-muted-foreground">
                      {" "}
                      · {stage.dealCount} deal{stage.dealCount === 1 ? "" : "s"}
                    </span>
                  </p>
                  <p className="shrink-0 text-sm">
                    {formatAudFromCents(stage.totalCents)}
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      · {formatAudFromCents(stage.weightedCents)} at{" "}
                      {stage.weighting}%
                    </span>
                  </p>
                </div>
                <div
                  aria-hidden
                  className="h-1.5 overflow-hidden rounded-full bg-accent"
                >
                  <div
                    className="h-full rounded-full bg-blu"
                    style={{
                      width: `${Math.round((stage.totalCents / maxStageCents) * 100)}%`,
                    }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="On hold and blocked" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">On hold / blocked</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Deals on hold / blocked"
            value={String(onHoldCount)}
          />
          <StatCard
            label="Value held up"
            value={formatAudFromCents(onHoldTotalCents)}
          />
        </div>
        {subStatusBreakdown.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {subStatusBreakdown.map((row) => (
              <li key={row.subStatusId}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:border-blu/50 hover:bg-accent"
                  href={drillHref({ subStatus: row.subStatusId })}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        subStatusClasses(row.color).dot
                      )}
                    />
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {row.dealCount} · {formatAudFromCents(row.totalCents)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No deals are on hold or blocked.
          </p>
        )}
      </section>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <section aria-label="Win rate" className="flex flex-col gap-3">
          <h2 className="font-heading font-medium text-sm">
            Win rate — {periodLabel}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <StatCard
              label="Win rate"
              value={
                winRate.winRatePercent === null
                  ? "—"
                  : `${winRate.winRatePercent}%`
              }
            />
            <StatCard
              href={drillHref({ outcome: "won" })}
              label="Won value"
              value={formatAudFromCents(winRate.wonValueCents)}
            />
            <StatCard
              href={drillHref({ outcome: "won" })}
              label="Won"
              value={String(winRate.wonCount)}
            />
            <StatCard
              href={drillHref({ outcome: "lost" })}
              label="Lost / dormant"
              value={String(winRate.lostCount)}
            />
          </div>
          {winRate.lostReasons.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {winRate.lostReasons.map((reason) => (
                <li
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                  key={reason.label}
                >
                  <span>{reason.label}</span>
                  <span className="text-muted-foreground">{reason.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No lost deals in this period.
            </p>
          )}
        </section>

        <section aria-label="Activity volume" className="flex flex-col gap-3">
          <h2 className="font-heading font-medium text-sm">
            Activity — {periodLabel}
          </h2>
          {activityVolume.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No activity logged in this period.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {activityVolume.map((person) => (
                <li
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                  key={person.personName}
                >
                  <span>{person.personName}</span>
                  <span className="text-muted-foreground">
                    {person.activityCount} logged
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
