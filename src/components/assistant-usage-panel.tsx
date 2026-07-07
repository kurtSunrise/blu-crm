import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import {
  type AssistantUsageSummary,
  MESSAGES_WINDOW_DAYS,
  TURNS_WINDOW_DAYS,
} from "@/lib/ai/analytics";
import { formatDayMonthAwst } from "@/lib/format";

// Admin-only "Assistant activity" content for /settings/ai. Server-rendered:
// the bars are plain divs sized from the aggregates, no chart library and no
// client JS. Single-series marks use the brand blu accent; all text stays in
// text tokens.

const PERCENT = 100;

// Analytics day keys are ISO dates (YYYY-MM-DD, AWST-local); anchor them to
// AWST midnight so the shared house formatter renders the same calendar day.
const dayMonthOf = (dateKey: string): string =>
  formatDayMonthAwst(new Date(`${dateKey}T00:00:00+08:00`));

const humaniseToolName = (toolName: string): string =>
  toolName.replaceAll("_", " ");

function UsageHeading({ title }: { title: string }) {
  return (
    <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {title}
    </h3>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-muted-foreground text-sm">{text}</p>;
}

// 14 baseline-anchored bars, one per AWST day (zero-filled upstream). Each
// bar carries a title tooltip; the sr-only list is the accessible table view.
function MessagesPerDayBars({
  days,
}: {
  days: AssistantUsageSummary["messagesPerDay"];
}) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const first = days.at(0);
  const last = days.at(-1);

  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden className="flex h-16 items-end gap-1">
        {days.map((day) => (
          <div
            className="flex h-full flex-1 flex-col justify-end"
            key={day.date}
            title={`${dayMonthOf(day.date)}: ${day.count} message${day.count === 1 ? "" : "s"}`}
          >
            <div
              className={
                day.count === 0
                  ? "rounded-t-[2px] bg-muted-foreground/25"
                  : "rounded-t-[4px] bg-blu"
              }
              style={{
                height:
                  day.count === 0
                    ? "2px"
                    : `max(${(day.count / max) * PERCENT}%, 3px)`,
              }}
            />
          </div>
        ))}
      </div>
      <ul className="sr-only">
        {days.map((day) => (
          <li key={day.date}>
            {dayMonthOf(day.date)}: {day.count} messages
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-2 text-muted-foreground text-xs">
        <span>{first ? dayMonthOf(first.date) : ""}</span>
        <span>
          {total} message{total === 1 ? "" : "s"} in the last{" "}
          {MESSAGES_WINDOW_DAYS} days
        </span>
        <span>{last ? dayMonthOf(last.date) : ""}</span>
      </div>
    </div>
  );
}

// Label + proportional bar + count, shared by turns-per-user and top tools.
function CountBarList({
  items,
}: {
  items: { count: number; label: string }[];
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li className="flex items-center gap-2" key={item.label}>
          <span className="w-32 shrink-0 truncate text-sm">{item.label}</span>
          <span aria-hidden className="h-1.5 min-w-0 flex-1">
            <span
              className="block h-full rounded-full bg-blu"
              style={{ width: `${(item.count / max) * PERCENT}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-muted-foreground text-sm tabular-nums">
            {item.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ai_audit_log statuses in a fixed, meaningful order; anything the audit
// trail adds later still shows, appended after the known ones.
const KNOWN_OUTCOMES = [
  { label: "Executed", status: "executed" },
  { label: "Denied", status: "denied" },
  { label: "Failed", status: "failed" },
  { label: "Skipped", status: "skipped" },
];

function WriteOutcomes({
  outcomes,
}: {
  outcomes: AssistantUsageSummary["writeOutcomes"];
}) {
  const countsByStatus = new Map(
    outcomes.map((outcome) => [outcome.status, outcome.count])
  );
  const known = KNOWN_OUTCOMES.map((outcome) => ({
    count: countsByStatus.get(outcome.status) ?? 0,
    label: outcome.label,
  }));
  const knownStatuses = new Set(KNOWN_OUTCOMES.map((o) => o.status));
  const extras = outcomes
    .filter((outcome) => !knownStatuses.has(outcome.status))
    .map((outcome) => ({
      count: outcome.count,
      label: humaniseToolName(outcome.status),
    }));

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[...known, ...extras].map((outcome) => (
        <div
          className="flex flex-col gap-0.5 rounded-md border bg-background p-2"
          key={outcome.label}
        >
          <dt className="text-muted-foreground text-xs capitalize">
            {outcome.label}
          </dt>
          <dd className="font-semibold text-sm tabular-nums">
            {outcome.count}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const TOP_TOOLS_SHOWN = 6;

export function AssistantUsagePanel({
  summary,
}: {
  summary: AssistantUsageSummary;
}) {
  const topTools = summary.toolCalls.slice(0, TOP_TOOLS_SHOWN);

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Messages per day" className="flex flex-col gap-2">
        <UsageHeading title="Messages per day" />
        {summary.messagesPerDay.length === 0 ? (
          <EmptyNote
            text={`No assistant messages in the last ${MESSAGES_WINDOW_DAYS} days.`}
          />
        ) : (
          <MessagesPerDayBars days={summary.messagesPerDay} />
        )}
      </section>

      <section aria-label="Turns per user" className="flex flex-col gap-2">
        <UsageHeading
          title={`Turns per user (last ${TURNS_WINDOW_DAYS} days)`}
        />
        {summary.turnsPerUser.length === 0 ? (
          <EmptyNote text="No assistant turns yet." />
        ) : (
          <CountBarList
            items={summary.turnsPerUser.map((row) => ({
              count: row.count,
              label: row.userName,
            }))}
          />
        )}
      </section>

      {/* Only gated writes reach the audit trail; read tools run inline and
          are uncounted, so this section is scoped honestly to write actions. */}
      <section
        aria-label="Write actions by tool"
        className="flex flex-col gap-2"
      >
        <UsageHeading title="Write actions by tool" />
        {topTools.length === 0 ? (
          <EmptyNote text="No write actions proposed yet." />
        ) : (
          <CountBarList
            items={topTools.map((row) => ({
              count: row.count,
              label: humaniseToolName(row.toolName),
            }))}
          />
        )}
      </section>

      <section aria-label="Write outcomes" className="flex flex-col gap-2">
        <UsageHeading title="Write outcomes" />
        <WriteOutcomes outcomes={summary.writeOutcomes} />
      </section>

      <section aria-label="Feedback" className="flex flex-col gap-2">
        <UsageHeading title="Feedback" />
        <div className="flex flex-wrap gap-2">
          <p className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm">
            <ThumbsUpIcon aria-hidden className="size-4 text-blu" />
            <span className="font-semibold tabular-nums">
              {summary.feedback.up}
            </span>
            <span className="text-muted-foreground">helpful</span>
          </p>
          <p className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm">
            <ThumbsDownIcon
              aria-hidden
              className="size-4 text-muted-foreground"
            />
            <span className="font-semibold tabular-nums">
              {summary.feedback.down}
            </span>
            <span className="text-muted-foreground">not helpful</span>
          </p>
        </div>
      </section>
    </div>
  );
}
