import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db";
import { deal, followUp, pipelineStage, user } from "@/db/schema";
import { FollowUpDoneButton } from "@/components/follow-up-done-button";
import { CLOSING_SOON_DAYS, STALE_DEAL_DAYS } from "@/lib/config";
import {
  daysFromNow,
  endOfTodayAwst,
  formatDateAwst,
  startOfTodayAwst,
} from "@/lib/format";

export const dynamic = "force-dynamic";

interface TaskRow {
  id: string;
  action: string;
  dueDate: Date;
  ownerName: string | null;
  dealId: string;
  dealTitle: string;
}

function FollowUpList({
  items,
  emptyText,
  overdue = false,
}: {
  items: TaskRow[];
  emptyText: string;
  overdue?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
            overdue ? "border-destructive/50 bg-destructive/10" : ""
          }`}
          key={item.id}
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{item.action}</p>
            <p className="text-muted-foreground text-xs">
              <Link
                className="underline underline-offset-2"
                href={`/deals/${item.dealId}`}
              >
                {item.dealTitle}
              </Link>
              {" · "}
              <span className={overdue ? "text-destructive" : undefined}>
                {formatDateAwst(item.dueDate)}
              </span>
              {item.ownerName ? ` · ${item.ownerName}` : ""}
            </p>
          </div>
          <FollowUpDoneButton followUpId={item.id} label={item.action} />
        </li>
      ))}
    </ul>
  );
}

export default async function TasksPage() {
  const todayStart = startOfTodayAwst();
  const todayEnd = endOfTodayAwst();

  const openFollowUps: TaskRow[] = await db
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
    .where(isNull(followUp.completedAt))
    .orderBy(followUp.dueDate);

  // Overdue items are visually distinct and sort above today's (FR-5.2 AC).
  const overdue = openFollowUps.filter((item) => item.dueDate < todayStart);
  const dueToday = openFollowUps.filter(
    (item) => item.dueDate >= todayStart && item.dueDate < todayEnd
  );
  const upcoming = openFollowUps.filter((item) => item.dueDate >= todayEnd);

  const openDealFilter = and(
    isNull(deal.deletedAt),
    eq(pipelineStage.isWon, false),
    eq(pipelineStage.isLost, false)
  );

  const closingCutoff = daysFromNow(CLOSING_SOON_DAYS);
  const closingSoon = await db
    .select({
      id: deal.id,
      title: deal.title,
      stageName: pipelineStage.name,
      fixedDate: deal.fixedDate,
      expectedCloseDate: deal.expectedCloseDate,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(
      and(
        openDealFilter,
        or(
          and(
            gte(deal.fixedDate, todayStart),
            lte(deal.fixedDate, closingCutoff)
          ),
          and(
            gte(deal.expectedCloseDate, todayStart),
            lte(deal.expectedCloseDate, closingCutoff)
          )
        )
      )
    )
    .orderBy(deal.fixedDate);

  const staleCutoff = daysFromNow(-STALE_DEAL_DAYS);
  const needsAttention = await db
    .select({
      id: deal.id,
      title: deal.title,
      stageName: pipelineStage.name,
      lastContactAt: deal.lastContactAt,
      createdAt: deal.createdAt,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(
      and(
        openDealFilter,
        sql`coalesce(${deal.lastContactAt}, ${deal.createdAt}) < ${staleCutoff}`
      )
    )
    .orderBy(deal.updatedAt);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Tasks</h1>
        <p className="text-muted-foreground text-sm">
          Follow-ups due, deals closing soon, and deals going quiet.
        </p>
      </header>

      <section aria-label="Overdue" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-destructive text-sm">
          Overdue ({overdue.length})
        </h2>
        <FollowUpList emptyText="Nothing overdue." items={overdue} overdue />
      </section>

      <section aria-label="Due today" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm">
          Due today ({dueToday.length})
        </h2>
        <FollowUpList emptyText="Nothing due today." items={dueToday} />
      </section>

      <section aria-label="Upcoming" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm">
          Upcoming ({upcoming.length})
        </h2>
        <FollowUpList emptyText="No upcoming follow-ups." items={upcoming} />
      </section>

      <Separator />

      <section aria-label="Closing soon" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm text-warning">
          Closing soon — fixed date within {CLOSING_SOON_DAYS} days (
          {closingSoon.length})
        </h2>
        {closingSoon.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No deals closing soon.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {closingSoon.map((item) => (
            <li key={item.id}>
              <Link
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-3"
                href={`/deals/${item.id}`}
              >
                <span className="truncate font-medium text-sm">
                  {item.title}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.fixedDate && (
                    <span className="text-warning text-xs">
                      {formatDateAwst(item.fixedDate)}
                    </span>
                  )}
                  <Badge variant="secondary">{item.stageName}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Needs attention" className="flex flex-col gap-2">
        <h2 className="font-heading font-medium text-sm">
          Needs attention — no contact for {STALE_DEAL_DAYS}+ days (
          {needsAttention.length})
        </h2>
        {needsAttention.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nothing going quiet. Nice.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {needsAttention.map((item) => (
            <li key={item.id}>
              <Link
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-3"
                href={`/deals/${item.id}`}
              >
                <span className="truncate font-medium text-sm">
                  {item.title}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    last contact{" "}
                    {formatDateAwst(item.lastContactAt ?? item.createdAt)}
                  </span>
                  <Badge variant="secondary">{item.stageName}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
