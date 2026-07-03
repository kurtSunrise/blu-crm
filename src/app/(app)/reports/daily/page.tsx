import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getEntryStyle } from "@/components/deal-timeline";
import { ReportsNav } from "@/components/reports/reports-nav";
import { buttonVariants } from "@/components/ui/button";
import {
  addDays,
  awstDateKey,
  DATE_KEY_PATTERN,
  type DateKey,
  dateKeyDiffDays,
  dateKeyHeading,
} from "@/lib/calendar";
import { formatDateTimeAwst, relativeDayLabel } from "@/lib/format";
import { type DailyDealActivity, getDailyActivity } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { DateJump } from "./date-jump";

export const dynamic = "force-dynamic";

function ActivityRow({
  entry,
}: {
  entry: DailyDealActivity["entries"][number];
}) {
  const style = getEntryStyle(entry.type);
  const Icon = style.icon;

  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground",
          style.marker
        )}
      >
        <Icon aria-hidden className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
        <p className="text-xs">
          <span className="font-medium">{style.label}</span>
          <span className="text-muted-foreground">
            {entry.authorName ? ` · ${entry.authorName}` : ""}
            {` · ${formatDateTimeAwst(entry.createdAt)}`}
          </span>
        </p>
        {entry.content && (
          <p className="break-words text-sm">{entry.content}</p>
        )}
      </div>
    </li>
  );
}

function DealActivityCard({ deal }: { deal: DailyDealActivity }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <Link className="flex flex-col gap-0.5" href={`/deals/${deal.dealId}`}>
        <p className="font-medium text-sm">
          <span className="font-mono text-muted-foreground text-xs">
            {deal.leadId}
          </span>{" "}
          {deal.title}
        </p>
        <p className="text-muted-foreground text-xs">
          {deal.companyName ?? "No company"} · {deal.stageName}
        </p>
      </Link>
      <ul className="flex flex-col gap-3">
        {deal.entries.map((entry) => (
          <ActivityRow entry={entry} key={entry.id} />
        ))}
      </ul>
    </section>
  );
}

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const todayKey = awstDateKey(new Date());
  const dateKey: DateKey =
    date && DATE_KEY_PATTERN.test(date) ? date : todayKey;

  const deals = await getDailyActivity(dateKey);
  const activityCount = deals.reduce(
    (sum, deal) => sum + deal.entries.length,
    0
  );
  const relativeLabel = relativeDayLabel(dateKeyDiffDays(dateKey, todayKey));
  const heading = dateKeyHeading(dateKey);

  const navLinkClass = cn(
    buttonVariants({ variant: "outline" }),
    "min-h-11 min-w-11"
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-5xl">
      <ReportsNav active="/reports/daily" />
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-semibold text-2xl tracking-tight">
              Daily status
            </h1>
            <h2 className="text-muted-foreground text-sm">
              {heading} · {relativeLabel}
            </h2>
            <p className="text-muted-foreground text-sm">
              {deals.length === 0
                ? "Nothing logged"
                : `${deals.length} deal${deals.length === 1 ? "" : "s"} touched · ${activityCount} ${activityCount === 1 ? "activity" : "activities"}`}
            </p>
          </div>
          <nav
            aria-label="Day navigation"
            className="flex flex-wrap items-center gap-2"
          >
            <Link
              aria-label="Previous day"
              className={navLinkClass}
              href={`/reports/daily?date=${addDays(dateKey, -1)}`}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Link>
            <Link
              aria-label="Today"
              className={cn(navLinkClass, "px-4")}
              href="/reports/daily"
            >
              Today
            </Link>
            <Link
              aria-label="Next day"
              className={navLinkClass}
              href={`/reports/daily?date=${addDays(dateKey, 1)}`}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Link>
            <DateJump dateKey={dateKey} />
          </nav>
        </div>
      </header>

      {deals.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground text-sm">
          No activity logged on {heading}.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {deals.map((deal) => (
            <DealActivityCard deal={deal} key={deal.dealId} />
          ))}
        </div>
      )}
    </main>
  );
}
