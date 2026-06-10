import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  getAlertThresholds,
  getClosingSoonDeals,
  getStaleDeals,
} from "@/lib/alerts";
import { formatAudFromCents, formatDateAwst } from "@/lib/format";
import { LOST_REASON_LABELS, type LostReason } from "@/lib/labels";
import {
  awstWeekRange,
  getActionsForWeek,
  getNewLeadCount,
  getPipelineByStage,
  getWinRate,
} from "@/lib/reporting";

export const dynamic = "force-dynamic";

// The weekly Monday snapshot in Blu's report format (FR-8.2), rendered live
// from the same reporting reads as the dashboard so the numbers reconcile.
// The one-tap AI-generated, editable artifact version arrives with M4/M5.
export default async function WeeklyReportPage() {
  const { start, end } = awstWeekRange();
  const stages = await getPipelineByStage();
  const thisWeek = await getWinRate(start, end);
  const newLeads = await getNewLeadCount(start, end);
  const thresholds = await getAlertThresholds();
  const closingSoon = await getClosingSoonDeals(thresholds.closingSoonDays);
  const needsAttention = await getStaleDeals(thresholds.staleDays);
  const actions = await getActionsForWeek(end);

  const openStages = stages.filter((stage) => !(stage.isWon || stage.isLost));
  const activeLeads = openStages.reduce(
    (sum, stage) => sum + stage.dealCount,
    0
  );
  const weightedCents = openStages.reduce(
    (sum, stage) => sum + stage.weightedCents,
    0
  );
  const wonValueCents = thisWeek.won.reduce(
    (sum, item) => sum + item.valueCents,
    0
  );

  const summary = [
    { label: "Active leads", value: String(activeLeads) },
    { label: "Total weighted value", value: formatAudFromCents(weightedCents) },
    { label: "New this week", value: String(newLeads) },
    {
      label: "Won this week",
      value: `${thisWeek.won.length} (${formatAudFromCents(wonValueCents)})`,
    },
    { label: "Lost / dormant this week", value: String(thisWeek.lost.length) },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 lg:max-w-3xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          Weekly pipeline report
        </h1>
        <p className="text-muted-foreground text-sm">
          Week beginning {formatDateAwst(start)} · generated live ·{" "}
          <Link className="underline underline-offset-2" href="/reports">
            back to reports
          </Link>
        </p>
      </header>

      <section aria-label="Summary" className="flex flex-col gap-2">
        <h2 className="font-heading font-semibold text-lg">1. Summary</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {summary.map((item) => (
            <div className="flex flex-col" key={item.label}>
              <dt className="text-muted-foreground text-xs">{item.label}</dt>
              <dd className="font-medium text-sm">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Closing soon" className="flex flex-col gap-2">
        <h2 className="font-heading font-semibold text-lg">2. Closing soon</h2>
        {closingSoon.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing this week.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {closingSoon.map((item) => (
              <li key={item.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                  href={`/deals/${item.id}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
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

      <section aria-label="Needs attention" className="flex flex-col gap-2">
        <h2 className="font-heading font-semibold text-lg">
          3. Needs attention
        </h2>
        {needsAttention.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Every open deal has been touched inside {thresholds.staleDays} days.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {needsAttention.map((item) => (
              <li key={item.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                  href={`/deals/${item.id}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="text-muted-foreground text-xs">
                    last contact{" "}
                    {formatDateAwst(item.lastContactAt ?? item.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Pipeline by stage" className="flex flex-col gap-2">
        <h2 className="font-heading font-semibold text-lg">
          4. Full pipeline by stage
        </h2>
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
              <span className="font-medium">
                {formatAudFromCents(stage.totalCents)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Won this week" className="flex flex-col gap-2">
        <h2 className="font-heading font-semibold text-lg">5. Won this week</h2>
        {thisWeek.won.length === 0 ? (
          <p className="text-muted-foreground text-sm">No wins yet. Go on.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {thisWeek.won.map((item) => (
              <li key={item.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                  href={`/deals/${item.id}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="font-medium">
                    {formatAudFromCents(item.valueCents)}
                  </span>
                  <Badge
                    variant={item.handoverToDelivery ? "default" : "secondary"}
                  >
                    {item.handoverToDelivery
                      ? "Handover flagged"
                      : "No handover"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Lost this week" className="flex flex-col gap-2">
        <h2 className="font-heading font-semibold text-lg">
          6. Lost / dormant this week
        </h2>
        {thisWeek.lost.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing lost.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {thisWeek.lost.map((item) => (
              <li key={item.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                  href={`/deals/${item.id}`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <Badge variant="secondary">
                    {item.lostReason
                      ? LOST_REASON_LABELS[item.lostReason as LostReason]
                      : "No reason recorded"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Actions for the week"
        className="flex flex-col gap-2"
      >
        <h2 className="font-heading font-semibold text-lg">
          7. Actions for the week
        </h2>
        {actions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No open follow-ups due this week.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {actions.map((item) => (
              <li key={item.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
                  href={`/deals/${item.dealId}`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item.action}
                    <span className="text-muted-foreground">
                      {" "}
                      · {item.dealTitle}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {item.ownerName?.split(" ")[0] ?? "Unassigned"} · due{" "}
                    {formatDateAwst(item.dueDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="text-muted-foreground text-xs">
        Private and Confidential · Blu.Builders Pty Ltd · numbers reconcile with
        the Reports dashboard at generation time.
      </footer>
    </main>
  );
}
