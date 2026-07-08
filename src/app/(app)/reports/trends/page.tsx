import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import type { ForecastChartPoint } from "@/components/reports/charts/forecast-chart";
import { ForecastChart } from "@/components/reports/charts/forecast-chart";
import type { TrendChartPoint } from "@/components/reports/charts/trend-chart";
import { TrendChart } from "@/components/reports/charts/trend-chart";
import { ExportCsvLink } from "@/components/reports/export-csv-link";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportsNav } from "@/components/reports/reports-nav";
import type { DateKey } from "@/lib/calendar";
import { formatAudFromCents, formatDateAwst } from "@/lib/format";
import {
  describeReportPeriod,
  getClosedTrend,
  getCreatedTrend,
  getForecastByMonth,
  getReportOwners,
  getSlippedDeals,
  parseReportFilters,
  type ReportSearchParams,
  reportFilterParams,
  type TrendBucket,
  trendBucketFor,
  trendBucketKeys,
} from "@/lib/reports";

export const dynamic = "force-dynamic";

const WEEK_LABEL = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const MONTH_LABEL = new Intl.DateTimeFormat("en-AU", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

// Bucket keys are AWST-local calendar dates; formatting them as UTC keeps the
// printed day exactly the key's day.
const bucketLabel = (key: DateKey, bucket: TrendBucket): string =>
  (bucket === "week" ? WEEK_LABEL : MONTH_LABEL).format(
    new Date(`${key}T00:00:00Z`)
  );

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <span className="font-semibold text-2xl">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>;
}) {
  const filters = parseReportFilters(await searchParams);
  const bucket = trendBucketFor(filters);
  const periodLabel = describeReportPeriod(filters);
  const query = reportFilterParams(filters).toString();

  const [created, closed, forecast, slipped, owners] = await Promise.all([
    getCreatedTrend(filters, bucket),
    getClosedTrend(filters, bucket),
    getForecastByMonth(filters),
    getSlippedDeals(filters),
    getReportOwners(),
  ]);

  const createdByKey = new Map(created.map((row) => [row.bucketKey, row]));
  const closedByKey = new Map(closed.map((row) => [row.bucketKey, row]));
  const points: TrendChartPoint[] = trendBucketKeys(bucket, filters).map(
    (key) => ({
      label: bucketLabel(key, bucket),
      createdCents: createdByKey.get(key)?.totalCents ?? 0,
      createdCount: createdByKey.get(key)?.count ?? 0,
      wonCents: closedByKey.get(key)?.wonValueCents ?? 0,
      wonCount: closedByKey.get(key)?.wonCount ?? 0,
    })
  );

  const totals = points.reduce(
    (sum, point) => ({
      createdCents: sum.createdCents + point.createdCents,
      createdCount: sum.createdCount + point.createdCount,
      wonCents: sum.wonCents + point.wonCents,
      wonCount: sum.wonCount + point.wonCount,
    }),
    { createdCents: 0, createdCount: 0, wonCents: 0, wonCount: 0 }
  );

  const forecastPoints: ForecastChartPoint[] = forecast.map((row) => ({
    label: row.monthKey
      ? MONTH_LABEL.format(new Date(`${row.monthKey}-01T00:00:00Z`))
      : "No date",
    count: row.count,
    totalCents: row.totalCents,
    weightedCents: row.weightedCents,
  }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-4 md:gap-6 md:py-6 lg:max-w-5xl">
      <PageHeader
        actions={<ExportCsvLink query={query} report="trends" />}
        subtitle="How the pipeline is moving over time, and where the forecast lands."
        title="Trends"
      />

      <ReportsNav active="/reports/trends" query={query} />
      <ReportFilters owners={owners} />

      <section aria-label="New business" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">
          New pipeline vs won — {periodLabel}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="New pipeline"
            value={formatAudFromCents(totals.createdCents)}
          />
          <StatCard label="Deals added" value={String(totals.createdCount)} />
          <StatCard
            label="Won value"
            value={formatAudFromCents(totals.wonCents)}
          />
          <StatCard label="Deals won" value={String(totals.wonCount)} />
        </div>
        <div className="rounded-lg border bg-card p-3">
          <TrendChart data={points} />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            View as table
          </summary>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="py-1 pr-3 font-medium" scope="col">
                  Period
                </th>
                <th className="py-1 pr-3 font-medium" scope="col">
                  New pipeline
                </th>
                <th className="py-1 font-medium" scope="col">
                  Won
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr className="border-t" key={point.label}>
                  <td className="py-1 pr-3">{point.label}</td>
                  <td className="py-1 pr-3 tabular-nums">
                    {formatAudFromCents(point.createdCents)} (
                    {point.createdCount})
                  </td>
                  <td className="py-1 tabular-nums">
                    {formatAudFromCents(point.wonCents)} ({point.wonCount})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section aria-label="Forecast" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">
          Forecast by expected close month
        </h2>
        <p className="text-muted-foreground text-xs">
          Open deals only, weighted by their stage's win likelihood. "No date"
          bundles deals without an expected close date.
        </p>
        {forecastPoints.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No open deals to forecast.
          </p>
        ) : (
          <div className="rounded-lg border bg-card p-3">
            <ForecastChart data={forecastPoints} />
          </div>
        )}
      </section>

      <section aria-label="Slipped deals" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">Slipped deals</h2>
        <p className="text-muted-foreground text-xs">
          Open deals past their expected close date — re-date them or move them
          on so the forecast stays honest.
        </p>
        {slipped.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing has slipped. Every open deal is inside its expected close
            date.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {slipped.map((row) => (
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
                    </span>
                    <span className="shrink-0 text-destructive">
                      {row.daysOverdue} day{row.daysOverdue === 1 ? "" : "s"}{" "}
                      overdue · was {formatDateAwst(row.expectedCloseDate)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
