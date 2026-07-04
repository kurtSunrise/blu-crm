import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { ArrowRight, Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { CompleteFollowUpButton } from "@/components/complete-follow-up-button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { activity, deal, followUp, user } from "@/db/schema";
import {
  getAlertThresholds,
  getClosingSoonDeals,
  getStaleDeals,
} from "@/lib/alerts";
import {
  awstDayRange,
  formatAudFromCents,
  formatDateAwst,
  formatDateTimeAwst,
  MS_PER_DAY,
} from "@/lib/format";
import {
  getStageBreakdown,
  getWinRate,
  summarisePipeline,
} from "@/lib/reports";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WIN_RATE_WINDOW_DAYS = 30;
const LIST_LIMIT = 5;
const ACTIVITY_LIMIT = 8;

const ACTIVITY_LABELS: Record<string, string> = {
  call: "Call",
  email: "Email",
  site_visit: "Site visit",
  meeting: "Meeting",
  note: "Note",
  stage_change: "Stage",
  quote_event: "Quote",
};

const AWST_LONG_DATE = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Perth",
  weekday: "long",
  day: "numeric",
  month: "long",
});

function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="font-heading font-semibold text-lg">{title}</h2>
      <Link
        className="flex items-center gap-1 text-blu text-xs underline-offset-2 hover:underline"
        href={href}
      >
        {linkLabel}
        <ArrowRight aria-hidden className="size-3" />
      </Link>
    </div>
  );
}

export default async function Home() {
  const { start, end } = awstDayRange();
  const winRateSince = new Date(Date.now() - WIN_RATE_WINDOW_DAYS * MS_PER_DAY);

  // Two waves rather than eight serial round trips: stacked sequential Neon
  // queries in one render have caused production 503s on workerd. Only the
  // stale/closing-soon alerts depend on thresholds, so they wait for wave 1.
  const [stages, winRate, thresholds, [inboxCount], dueTasks, recentActivity] =
    await Promise.all([
      getStageBreakdown(),
      getWinRate(winRateSince),
      getAlertThresholds(),
      db
        .select({ value: count(deal.id) })
        .from(deal)
        .where(and(isNull(deal.ownerId), isNull(deal.deletedAt))),
      // Today's working list: overdue first, then due today (FR-5.2).
      db
        .select({
          id: followUp.id,
          action: followUp.action,
          dueDate: followUp.dueDate,
          ownerName: user.name,
          dealId: deal.id,
          dealTitle: deal.title,
        })
        .from(followUp)
        .innerJoin(deal, eq(followUp.dealId, deal.id))
        .leftJoin(user, eq(followUp.ownerId, user.id))
        .where(
          and(
            isNull(followUp.completedAt),
            isNull(deal.deletedAt),
            lt(followUp.dueDate, end)
          )
        )
        .orderBy(followUp.dueDate)
        .limit(LIST_LIMIT + 1),
      db
        .select({
          id: activity.id,
          type: activity.type,
          content: activity.content,
          createdAt: activity.createdAt,
          authorName: user.name,
          dealId: deal.id,
          dealTitle: deal.title,
        })
        .from(activity)
        .innerJoin(deal, eq(activity.dealId, deal.id))
        .leftJoin(user, eq(activity.createdBy, user.id))
        .where(isNull(deal.deletedAt))
        .orderBy(desc(activity.createdAt))
        .limit(ACTIVITY_LIMIT),
    ]);

  const [staleDeals, closingSoonDeals] = await Promise.all([
    getStaleDeals(thresholds.staleDays),
    getClosingSoonDeals(thresholds.closingSoonDays),
  ]);

  const openStages = stages.filter((stage) => !(stage.isWon || stage.isLost));
  const totals = summarisePipeline(stages);
  const maxStageCents = Math.max(
    ...openStages.map((stage) => stage.totalCents),
    1
  );
  const overdueCount = dueTasks.filter((task) => task.dueDate < start).length;

  const kpis = [
    {
      label: `Open pipeline · ${totals.openCount} deals`,
      value: formatAudFromCents(totals.openTotalCents),
      href: "/pipeline",
      alert: false,
    },
    {
      label: "Weighted forecast",
      value: formatAudFromCents(totals.weightedTotalCents),
      href: "/reports",
      alert: false,
    },
    {
      label: `Win rate · ${WIN_RATE_WINDOW_DAYS} days`,
      value:
        winRate.winRatePercent === null ? "n/a" : `${winRate.winRatePercent}%`,
      href: "/reports",
      alert: false,
    },
    {
      label: "Overdue follow-ups",
      value: String(overdueCount),
      href: "/tasks",
      alert: overdueCount > 0,
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-blu text-xs uppercase tracking-widest">
            Blu Builders · The Creative Build Company
          </p>
          <h1 className="font-semibold text-2xl tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {AWST_LONG_DATE.format(new Date())}
          </p>
        </div>
        <Link
          className="flex min-h-11 items-center gap-2 rounded-md bg-blu px-4 font-medium text-blu-foreground text-sm transition-opacity hover:opacity-90"
          href="/deals/new"
        >
          <Plus aria-hidden className="size-4" />
          Quick add lead
        </Link>
      </header>

      {(inboxCount?.value ?? 0) > 0 && (
        <Link
          className="flex items-center gap-3 rounded-lg border border-blu/50 bg-blu/10 p-3 text-sm transition-colors hover:border-blu"
          href="/inbox"
        >
          <Inbox aria-hidden className="size-5 text-blu" />
          <span className="flex-1">
            {inboxCount?.value} new lead{inboxCount?.value === 1 ? "" : "s"}{" "}
            waiting for triage in the Inbox
          </span>
          <ArrowRight aria-hidden className="size-4 text-blu" />
        </Link>
      )}

      <section aria-label="Key numbers">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <Link
              className="flex flex-col gap-1 rounded-lg border bg-card p-4 transition-colors hover:border-blu"
              href={kpi.href}
              key={kpi.label}
            >
              <span
                className={cn(
                  "font-semibold text-2xl tracking-tight",
                  kpi.alert && "text-destructive"
                )}
              >
                {kpi.value}
              </span>
              <span className="text-muted-foreground text-xs">{kpi.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Pipeline by stage" className="flex flex-col gap-3">
        <SectionHeading
          href="/pipeline"
          linkLabel="Open the board"
          title="Pipeline by stage"
        />
        <ul className="flex flex-col gap-2">
          {openStages.map((stage) => (
            <li key={stage.stageId}>
              <Link className="group flex flex-col gap-1" href="/pipeline">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {stage.stageName}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {stage.dealCount} · {formatAudFromCents(stage.totalCents)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blu transition-all group-hover:opacity-80"
                    style={{
                      width: `${Math.max((stage.totalCents / maxStageCents) * 100, stage.dealCount > 0 ? 2 : 0)}%`,
                    }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-label="Today's tasks" className="flex flex-col gap-3">
          <SectionHeading
            href="/tasks"
            linkLabel="All tasks"
            title="Today's tasks"
          />
          {dueTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing due. Add a next action to every open deal.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dueTasks.slice(0, LIST_LIMIT).map((task) => {
                const overdue = task.dueDate < start;
                return (
                  <li
                    className={cn(
                      "flex items-center gap-3 rounded-lg border bg-card p-3",
                      overdue && "border-destructive/60"
                    )}
                    key={task.id}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">
                        {task.action}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        <Link
                          className="underline underline-offset-2"
                          href={`/deals/${task.dealId}`}
                        >
                          {task.dealTitle}
                        </Link>
                        {task.ownerName
                          ? ` · ${task.ownerName.split(" ")[0]}`
                          : ""}
                      </p>
                    </div>
                    {overdue && <Badge variant="destructive">Overdue</Badge>}
                    <CompleteFollowUpButton
                      action={task.action}
                      followUpId={task.id}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {dueTasks.length > LIST_LIMIT && (
            <Link
              className="text-blu text-sm underline-offset-2 hover:underline"
              href="/tasks"
            >
              More on the tasks page
            </Link>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-label="Closing soon" className="flex flex-col gap-3">
            <SectionHeading
              href="/tasks"
              linkLabel="See all"
              title="Closing soon"
            />
            {closingSoonDeals.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No fixed dates inside {thresholds.closingSoonDays} days.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {closingSoonDeals.slice(0, LIST_LIMIT).map((item) => (
                  <li key={item.id}>
                    <Link
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:border-blu"
                      href={`/deals/${item.id}`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {(item.fixedDate ?? item.expectedCloseDate)
                          ? formatDateAwst(
                              (item.fixedDate ?? item.expectedCloseDate) as Date
                            )
                          : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Needs attention" className="flex flex-col gap-3">
            <SectionHeading
              href="/tasks"
              linkLabel="See all"
              title="Needs attention"
            />
            {staleDeals.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Every open deal touched inside {thresholds.staleDays} days.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {staleDeals.slice(0, LIST_LIMIT).map((item) => (
                  <li key={item.id}>
                    <Link
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:border-blu"
                      href={`/deals/${item.id}`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatDateAwst(item.lastContactAt ?? item.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section aria-label="Recent activity" className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-lg">Recent activity</h2>
        {recentActivity.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Activity from the whole team shows up here.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {recentActivity.map((entry) => (
              <li
                className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm"
                key={entry.id}
              >
                <Badge variant="outline">
                  {ACTIVITY_LABELS[entry.type] ?? entry.type}
                </Badge>
                <span className="min-w-0 flex-1 truncate">
                  {entry.content ?? ""}
                  <Link
                    className="text-muted-foreground underline underline-offset-2"
                    href={`/deals/${entry.dealId}`}
                  >
                    {" "}
                    {entry.dealTitle}
                  </Link>
                </span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {formatDateTimeAwst(entry.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-muted-foreground text-xs">
        <span>Blu.Builders Pty Ltd · Malaga, Western Australia</span>
        <span className="flex gap-3">
          <Link className="underline-offset-2 hover:underline" href="/calendar">
            Calendar
          </Link>
          <Link className="underline-offset-2 hover:underline" href="/contacts">
            Contacts
          </Link>
          <Link className="underline-offset-2 hover:underline" href="/reports">
            Reports
          </Link>
          <Link className="underline-offset-2 hover:underline" href="/help">
            Help
          </Link>
          <Link className="underline-offset-2 hover:underline" href="/settings">
            Settings
          </Link>
        </span>
      </footer>
    </main>
  );
}
