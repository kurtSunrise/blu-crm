import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatAudFromCents, MS_PER_DAY } from "@/lib/format";
import { LOST_REASON_LABELS, type LostReason } from "@/lib/labels";
import {
  getActivityVolume,
  getPipelineByStage,
  getWinRate,
} from "@/lib/reporting";

export const dynamic = "force-dynamic";

const WIN_RATE_WINDOW_DAYS = 30;

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "Calls",
  email: "Emails",
  site_visit: "Site visits",
  meeting: "Meetings",
  note: "Notes",
  stage_change: "Stage changes",
  quote_event: "Quote events",
};

const reasonLabel = (reason: string): string =>
  reason === "unrecorded"
    ? "No reason recorded"
    : (LOST_REASON_LABELS[reason as LostReason] ?? reason);

export default async function ReportsPage() {
  const since = new Date(Date.now() - WIN_RATE_WINDOW_DAYS * MS_PER_DAY);
  const stages = await getPipelineByStage();
  const winRate = await getWinRate(since);
  const volume = await getActivityVolume(since);

  const openStages = stages.filter((stage) => !(stage.isWon || stage.isLost));
  const openValueCents = openStages.reduce(
    (sum, stage) => sum + stage.totalCents,
    0
  );
  const openCount = openStages.reduce((sum, stage) => sum + stage.dealCount, 0);
  const weightedCents = openStages.reduce(
    (sum, stage) => sum + stage.weightedCents,
    0
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 lg:max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">
            Live pipeline truth. Win rate and activity cover the last{" "}
            {WIN_RATE_WINDOW_DAYS} days.
          </p>
        </div>
        <Link
          className="flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors hover:border-blu"
          href="/reports/weekly"
        >
          Weekly Monday report
        </Link>
      </header>

      <section aria-label="Pipeline overview" className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-lg">Pipeline</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
            <span className="font-semibold text-2xl">
              {formatAudFromCents(openValueCents)}
            </span>
            <span className="text-muted-foreground text-xs">
              Open pipeline ({openCount} deals)
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
            <span className="font-semibold text-2xl">
              {formatAudFromCents(weightedCents)}
            </span>
            <span className="text-muted-foreground text-xs">
              Weighted forecast (value x stage probability)
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
            <span className="font-semibold text-2xl">
              {winRate.winRatePercent === null
                ? "n/a"
                : `${winRate.winRatePercent}%`}
            </span>
            <span className="text-muted-foreground text-xs">
              Win rate, last {WIN_RATE_WINDOW_DAYS} days ({winRate.won.length}{" "}
              won / {winRate.lost.length} lost)
            </span>
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {stages.map((stage) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
              key={stage.id}
            >
              <span className="min-w-0 flex-1 truncate">{stage.name}</span>
              <span className="text-muted-foreground text-xs">
                {stage.dealCount} deal{stage.dealCount === 1 ? "" : "s"}
              </span>
              <span className="w-24 text-right font-medium">
                {formatAudFromCents(stage.totalCents)}
              </span>
              {!(stage.isWon || stage.isLost) && (
                <span className="w-28 text-right text-muted-foreground text-xs">
                  {formatAudFromCents(stage.weightedCents)} @ {stage.weighting}%
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Lost reasons" className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-lg">
          Lost and dormant reasons
        </h2>
        {winRate.lostReasonCounts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing lost in the last {WIN_RATE_WINDOW_DAYS} days.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {winRate.lostReasonCounts.map((entry) => (
              <li
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                key={entry.reason}
              >
                <span>{reasonLabel(entry.reason)}</span>
                <Badge variant="secondary">{entry.count}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Activity volume" className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-lg">Activity</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-sm">By type</h3>
            {volume.byType.length === 0 && (
              <p className="text-muted-foreground text-sm">No activity yet.</p>
            )}
            <ul className="flex flex-col gap-1">
              {volume.byType.map((row) => (
                <li
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                  key={row.label}
                >
                  <span>{ACTIVITY_TYPE_LABELS[row.label] ?? row.label}</span>
                  <Badge variant="secondary">{row.count}</Badge>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-sm">By person</h3>
            <ul className="flex flex-col gap-1">
              {volume.byPerson.map((row) => (
                <li
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
                  key={row.label}
                >
                  <span>{row.label}</span>
                  <Badge variant="secondary">{row.count}</Badge>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Per-person attribution starts once sign-in ships; earlier activity
              shows as Unattributed.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
