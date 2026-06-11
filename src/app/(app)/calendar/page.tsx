import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  CalendarAgenda,
  type CalendarEvent,
  CalendarLegend,
  CalendarMonth,
} from "@/components/calendar-month";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { company, deal, followUp, pipelineStage, user } from "@/db/schema";
import {
  addMonths,
  awstDateKey,
  awstMonthKey,
  awstMonthRange,
  type DateKey,
  MONTH_KEY_PATTERN,
  monthGridWeeks,
  monthLabel,
} from "@/lib/calendar";
import { FIXED_DATE_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_ORDER: Record<CalendarEvent["kind"], number> = {
  fixed: 0,
  close: 1,
  follow_up: 2,
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const todayKey = awstDateKey(new Date());
  const monthKey =
    month && MONTH_KEY_PATTERN.test(month) ? month : awstMonthKey(new Date());
  const { start, end } = awstMonthRange(monthKey);

  const [fixedRows, closeRows, dueRows] = await Promise.all([
    // Hard project dates. Won deals stay visible (the install still happens);
    // Lost / Dormant deals are excluded.
    db
      .select({
        id: deal.id,
        title: deal.title,
        date: deal.fixedDate,
        fixedDateType: deal.fixedDateType,
        companyName: company.name,
      })
      .from(deal)
      .leftJoin(company, eq(deal.companyId, company.id))
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .where(
        and(
          isNull(deal.deletedAt),
          eq(pipelineStage.isLost, false),
          gte(deal.fixedDate, start),
          lt(deal.fixedDate, end)
        )
      ),
    // Forecast dates only matter while the deal is still open.
    db
      .select({
        id: deal.id,
        title: deal.title,
        date: deal.expectedCloseDate,
        companyName: company.name,
      })
      .from(deal)
      .leftJoin(company, eq(deal.companyId, company.id))
      .where(
        and(
          isNull(deal.deletedAt),
          isNull(deal.closedAt),
          gte(deal.expectedCloseDate, start),
          lt(deal.expectedCloseDate, end)
        )
      ),
    db
      .select({
        id: followUp.id,
        action: followUp.action,
        date: followUp.dueDate,
        dealId: deal.id,
        dealTitle: deal.title,
        ownerName: user.name,
      })
      .from(followUp)
      .innerJoin(deal, eq(followUp.dealId, deal.id))
      .leftJoin(user, eq(followUp.ownerId, user.id))
      .where(
        and(
          isNull(followUp.completedAt),
          isNull(deal.deletedAt),
          gte(followUp.dueDate, start),
          lt(followUp.dueDate, end)
        )
      ),
  ]);

  const events: CalendarEvent[] = [
    ...fixedRows.flatMap((row) =>
      row.date
        ? {
            id: `fixed-${row.id}`,
            kind: "fixed" as const,
            dateKey: awstDateKey(row.date),
            title: row.title,
            subtitle: row.companyName,
            typeLabel: row.fixedDateType
              ? FIXED_DATE_TYPE_LABELS[row.fixedDateType]
              : "Fixed date",
            href: `/deals/${row.id}`,
          }
        : []
    ),
    ...closeRows.flatMap((row) =>
      row.date
        ? {
            id: `close-${row.id}`,
            kind: "close" as const,
            dateKey: awstDateKey(row.date),
            title: row.title,
            subtitle: row.companyName,
            typeLabel: "Expected close",
            href: `/deals/${row.id}`,
          }
        : []
    ),
    ...dueRows.map((row) => ({
      id: `fu-${row.id}`,
      kind: "follow_up" as const,
      dateKey: awstDateKey(row.date),
      title: row.action,
      subtitle: row.ownerName
        ? `${row.dealTitle} · ${row.ownerName.split(" ")[0]}`
        : row.dealTitle,
      typeLabel: "Follow-up",
      href: `/deals/${row.dealId}`,
    })),
  ];

  const eventsByDay: Record<DateKey, CalendarEvent[]> = {};
  for (const event of events) {
    const dayEvents = eventsByDay[event.dateKey] ?? [];
    dayEvents.push(event);
    eventsByDay[event.dateKey] = dayEvents;
  }
  for (const dayEvents of Object.values(eventsByDay)) {
    dayEvents.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.title.localeCompare(b.title)
    );
  }
  const agendaDays = Object.keys(eventsByDay)
    .sort()
    .map((dateKey) => ({ dateKey, events: eventsByDay[dateKey] }));

  const navLinkClass = cn(
    buttonVariants({ variant: "outline" }),
    "min-h-11 min-w-11"
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 lg:max-w-5xl">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-semibold text-2xl tracking-tight">Calendar</h1>
            <h2 className="text-muted-foreground text-sm">
              {monthLabel(monthKey)}
            </h2>
          </div>
          <nav
            aria-label="Month navigation"
            className="flex items-center gap-2"
          >
            <Link
              aria-label="Previous month"
              className={navLinkClass}
              href={`/calendar?month=${addMonths(monthKey, -1)}`}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Link>
            <Link
              aria-label="Current month"
              className={cn(navLinkClass, "px-4")}
              href="/calendar"
            >
              Today
            </Link>
            <Link
              aria-label="Next month"
              className={navLinkClass}
              href={`/calendar?month=${addMonths(monthKey, 1)}`}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </nav>
        </div>
        <CalendarLegend />
      </header>

      <CalendarMonth
        eventsByDay={eventsByDay}
        monthKey={monthKey}
        todayKey={todayKey}
        weeks={monthGridWeeks(monthKey)}
      />

      <CalendarAgenda days={agendaDays} todayKey={todayKey} />
    </main>
  );
}
