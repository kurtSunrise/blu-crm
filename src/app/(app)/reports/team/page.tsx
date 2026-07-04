import { PageHeader } from "@/components/page-header";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportsNav } from "@/components/reports/reports-nav";
import { formatAudFromCents } from "@/lib/format";
import {
  type ActivityMixRow,
  describeReportPeriod,
  getActivityMix,
  getFollowUpStats,
  getQuoteFunnel,
  getReportOwners,
  getWinRate,
  parseReportFilters,
  type ReportSearchParams,
  reportFilterParams,
} from "@/lib/reports";

export const dynamic = "force-dynamic";

const PERCENT = 100;

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "calls",
  email: "emails",
  site_visit: "site visits",
  meeting: "meetings",
  note: "notes",
  stage_change: "stage moves",
  quote_event: "quote events",
  follow_up: "follow-ups",
};

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

const percentOf = (part: number, whole: number): string =>
  whole > 0 ? `${Math.round((part / whole) * PERCENT)}%` : "—";

// "12 calls · 8 emails · 3 notes" from the raw per-type counts, biggest first.
const describeMix = (row: ActivityMixRow): string =>
  Object.entries(row.countsByType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${ACTIVITY_TYPE_LABELS[type] ?? type}`)
    .join(" · ");

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <span className="font-semibold text-2xl">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export default async function TeamReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>;
}) {
  const filters = parseReportFilters(await searchParams);
  const periodLabel = describeReportPeriod(filters);
  const query = reportFilterParams(filters).toString();

  const [quotes, activityMix, followUps, winRate, owners] = await Promise.all([
    getQuoteFunnel(filters),
    getActivityMix(filters),
    getFollowUpStats(filters),
    getWinRate(filters.from, filters),
    getReportOwners(),
  ]);

  const maxActivity = Math.max(...activityMix.map((row) => row.totalCount), 1);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <PageHeader
        subtitle="Quote conversion and each person's activity and follow-through."
        title="Team"
      />

      <ReportsNav active="/reports/team" query={query} />
      <ReportFilters owners={owners} />

      <section aria-label="Quotes" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">
          Quotes — {periodLabel}
        </h2>
        {quotes.totalCount === 0 ? (
          <p className="text-muted-foreground text-sm">
            No quotes were created in this period.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Quotes sent" value={String(quotes.sentCount)} />
              <StatCard
                label={`Viewed (${percentOf(quotes.viewedCount, quotes.sentCount)} of sent)`}
                value={String(quotes.viewedCount)}
              />
              <StatCard
                label={`Accepted (${percentOf(quotes.acceptedCount, quotes.sentCount)} of sent)`}
                value={String(quotes.acceptedCount)}
              />
              <StatCard
                label="Accepted value"
                value={formatAudFromCents(quotes.acceptedValueCents)}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {quotes.draftCount} draft{quotes.draftCount === 1 ? "" : "s"} not
              yet sent · {quotes.declinedCount} declined · clients open a quote
              after {formatDays(quotes.avgDaysSentToViewed)} on average and
              accepted ones are decided in{" "}
              {formatDays(quotes.avgDaysSentToResponse)}.
            </p>
          </>
        )}
      </section>

      <section aria-label="Activity by person" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">
          Activity — {periodLabel}
        </h2>
        {activityMix.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No activity logged in this period.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activityMix.map((row) => (
              <li
                className="flex flex-col gap-1.5 rounded-lg border bg-card p-3"
                key={row.personName}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium text-sm">
                    {row.personName}
                  </p>
                  <p className="shrink-0 text-sm">
                    {row.totalCount}
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      logged
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
                      width: `${Math.round((row.totalCount / maxActivity) * PERCENT)}%`,
                    }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  {describeMix(row)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <section aria-label="Follow-through" className="flex flex-col gap-3">
          <h2 className="font-heading font-medium text-sm">
            Follow-ups due {periodLabel}
          </h2>
          {followUps.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No follow-ups were due in this period.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {followUps.map((row) => (
                <li
                  className="flex flex-col gap-0.5 rounded-md border bg-card px-3 py-2"
                  key={row.personName}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-medium text-sm">
                      {row.personName}
                    </p>
                    <p className="shrink-0 text-sm">
                      {percentOf(row.completedCount, row.totalCount)}
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        done
                      </span>
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {row.completedCount} of {row.totalCount} completed ·{" "}
                    {percentOf(row.onTimeCount, row.completedCount)} of those on
                    time
                    {row.overdueOpenCount > 0
                      ? ` · ${row.overdueOpenCount} still overdue`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Win rate" className="flex flex-col gap-3">
          <h2 className="font-heading font-medium text-sm">
            Win rate — {periodLabel}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
            <StatCard
              label="Win rate"
              value={
                winRate.winRatePercent === null
                  ? "—"
                  : `${winRate.winRatePercent}%`
              }
            />
            <StatCard label="Won" value={String(winRate.wonCount)} />
            <StatCard
              label="Lost / dormant"
              value={String(winRate.lostCount)}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Narrow to one person with the owner filter above to see their
            individual numbers across every section.
          </p>
        </section>
      </div>
    </main>
  );
}
