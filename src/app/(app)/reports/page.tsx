import { CalendarDays, FileText } from "lucide-react";
import Link from "next/link";
import { formatAudFromCents, MS_PER_DAY } from "@/lib/format";
import { SUB_STATUS_COLOR } from "@/lib/labels";
import {
  getActivityVolume,
  getStageBreakdown,
  getSubStatusBreakdown,
  getWinRate,
  summarisePipeline,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PERIOD_OPTIONS = [7, 30, 90] as const;
const DEFAULT_PERIOD_DAYS = 30;

const parsePeriodDays = (value: string | undefined): number => {
  const parsed = Number(value);
  return PERIOD_OPTIONS.some((option) => option === parsed)
    ? parsed
    : DEFAULT_PERIOD_DAYS;
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <span className="font-semibold text-2xl">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const periodDays = parsePeriodDays(days);
  const since = new Date(Date.now() - periodDays * MS_PER_DAY);

  // Independent report queries run in one parallel batch instead of three
  // sequential Neon round-trips.
  const [breakdown, winRate, activityVolume, subStatusBreakdown] =
    await Promise.all([
      getStageBreakdown(),
      getWinRate(since),
      getActivityVolume(since),
      getSubStatusBreakdown(),
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
            report uses.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="flex min-h-11 items-center gap-2 rounded-md border px-4 font-medium text-sm transition-colors hover:bg-accent"
            href="/reports/daily"
          >
            <CalendarDays aria-hidden className="size-4" />
            Daily status
          </Link>
          <Link
            className="flex min-h-11 items-center gap-2 rounded-md bg-blu px-4 font-medium text-sm text-white transition-opacity hover:opacity-90"
            href="/reports/weekly"
          >
            <FileText aria-hidden className="size-4" />
            Weekly report
          </Link>
        </div>
      </header>

      <section aria-label="Pipeline overview" className="flex flex-col gap-3">
        <h2 className="font-heading font-medium text-sm">Pipeline overview</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Open pipeline"
            value={formatAudFromCents(totals.openTotalCents)}
          />
          <StatCard label="Open deals" value={String(totals.openCount)} />
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
            <li
              className="flex flex-col gap-1.5 rounded-lg border bg-card p-3"
              key={stage.stageId}
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
              <li
                className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                key={row.subStatus}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      SUB_STATUS_COLOR[row.subStatus].dot
                    )}
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {row.dealCount} · {formatAudFromCents(row.totalCents)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No deals are on hold or blocked.
          </p>
        )}
      </section>

      <nav aria-label="Win rate period" className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((option) => (
          <Link
            className={cn(
              "flex min-h-9 items-center rounded-full border px-4 text-sm",
              option === periodDays
                ? "border-blu text-blu"
                : "text-muted-foreground"
            )}
            href={`/reports?days=${option}`}
            key={option}
          >
            Last {option} days
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <section aria-label="Win rate" className="flex flex-col gap-3">
          <h2 className="font-heading font-medium text-sm">
            Win rate — last {periodDays} days
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
              label="Won value"
              value={formatAudFromCents(winRate.wonValueCents)}
            />
            <StatCard label="Won" value={String(winRate.wonCount)} />
            <StatCard
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
            Activity — last {periodDays} days
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
