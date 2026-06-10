import Link from "next/link";
import {
  type DateKey,
  dateKeyDiffDays,
  dateKeyHeading,
  dayOfMonth,
  type MonthKey,
} from "@/lib/calendar";
import { relativeDayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CalendarEventKind = "fixed" | "close" | "follow_up";

export interface CalendarEvent {
  dateKey: DateKey;
  href: string;
  id: string;
  kind: CalendarEventKind;
  subtitle: string | null;
  title: string;
  // Chip text: "Install" / "Event" / "Launch" / "Expected close" / "Follow-up"
  typeLabel: string;
}

const KIND_STYLES: Record<
  CalendarEventKind,
  { legend: string; dot: string; chip: string }
> = {
  fixed: {
    legend: "Fixed date (install / event / launch)",
    dot: "bg-warning",
    chip: "bg-warning/10 text-warning dark:bg-warning/15",
  },
  close: {
    legend: "Expected close",
    dot: "bg-blu",
    chip: "bg-blu/10 text-blu dark:bg-blu/15",
  },
  follow_up: {
    legend: "Follow-up due",
    dot: "bg-success",
    chip: "bg-success/10 text-success dark:bg-success/15",
  },
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_DOTS_PER_CELL = 3;
const MAX_CHIPS_PER_CELL = 3;

export function CalendarLegend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1">
      {(Object.keys(KIND_STYLES) as CalendarEventKind[]).map((kind) => (
        <li
          className="flex items-center gap-1.5 text-muted-foreground text-xs"
          key={kind}
        >
          <span
            aria-hidden
            className={cn("size-2 rounded-full", KIND_STYLES[kind].dot)}
          />
          {KIND_STYLES[kind].legend}
        </li>
      ))}
    </ul>
  );
}

function DayNumber({
  dateKey,
  isToday,
}: {
  dateKey: DateKey;
  isToday: boolean;
}) {
  return (
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-full text-xs",
        isToday && "bg-blu/10 font-semibold text-blu"
      )}
    >
      {dayOfMonth(dateKey)}
    </span>
  );
}

function DayCell({
  dateKey,
  inMonth,
  isToday,
  events,
}: {
  dateKey: DateKey;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}) {
  const hasEvents = events.length > 0;
  const extraChips = events.length - MAX_CHIPS_PER_CELL;

  return (
    <div
      className={cn(
        "flex flex-col",
        inMonth ? "bg-card" : "bg-background text-muted-foreground/50"
      )}
    >
      {/* Phone: the whole cell is a tap target jumping to the day's agenda. */}
      {hasEvents ? (
        <a
          className="flex min-h-12 flex-col items-center gap-1 py-1.5 md:hidden"
          href={`#d-${dateKey}`}
        >
          <DayNumber dateKey={dateKey} isToday={isToday} />
          <span className="flex items-center gap-0.5">
            {events.slice(0, MAX_DOTS_PER_CELL).map((event) => (
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  KIND_STYLES[event.kind].dot
                )}
                key={event.id}
              />
            ))}
          </span>
          <span className="sr-only">
            {events.length} {events.length === 1 ? "item" : "items"}
          </span>
        </a>
      ) : (
        <div className="flex min-h-12 flex-col items-center py-1.5 md:hidden">
          <DayNumber dateKey={dateKey} isToday={isToday} />
        </div>
      )}

      {/* Tablet and desktop: event chips inside taller cells. */}
      <div className="hidden min-h-24 flex-col gap-1 p-1.5 md:flex">
        <DayNumber dateKey={dateKey} isToday={isToday} />
        {events.slice(0, MAX_CHIPS_PER_CELL).map((event) => (
          <Link
            className={cn(
              "block truncate rounded px-1.5 py-0.5 font-medium text-xs",
              KIND_STYLES[event.kind].chip
            )}
            href={event.href}
            key={event.id}
            title={`${event.typeLabel}: ${event.title}`}
          >
            {event.title}
          </Link>
        ))}
        {extraChips > 0 && (
          <a
            className="block rounded px-1.5 py-0.5 text-muted-foreground text-xs hover:text-foreground"
            href={`#d-${dateKey}`}
          >
            +{extraChips} more
          </a>
        )}
      </div>
    </div>
  );
}

export function CalendarMonth({
  monthKey,
  todayKey,
  weeks,
  eventsByDay,
}: {
  monthKey: MonthKey;
  todayKey: DateKey;
  weeks: DateKey[][];
  eventsByDay: Record<DateKey, CalendarEvent[]>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border shadow-sm">
      <div className="grid grid-cols-7 gap-px bg-border">
        {WEEKDAY_LABELS.map((label) => (
          <div
            className="bg-card py-1.5 text-center text-muted-foreground text-xs"
            key={label}
          >
            {label}
          </div>
        ))}
        {weeks.flat().map((dateKey) => (
          <DayCell
            dateKey={dateKey}
            events={eventsByDay[dateKey] ?? []}
            inMonth={dateKey.startsWith(monthKey)}
            isToday={dateKey === todayKey}
            key={dateKey}
          />
        ))}
      </div>
    </div>
  );
}

function AgendaDay({
  dateKey,
  todayKey,
  events,
}: {
  dateKey: DateKey;
  todayKey: DateKey;
  events: CalendarEvent[];
}) {
  const dayDiff = dateKeyDiffDays(dateKey, todayKey);
  return (
    <section
      aria-label={dateKeyHeading(dateKey)}
      className="flex scroll-mt-20 flex-col gap-2"
      id={`d-${dateKey}`}
    >
      <h3 className="font-heading font-medium text-sm">
        {dateKeyHeading(dateKey)}
        <span
          className={cn(
            "ml-2 font-normal font-sans text-xs",
            dayDiff === 0 && "font-medium text-blu",
            dayDiff < 0 && "font-medium text-destructive",
            dayDiff > 0 && "text-muted-foreground"
          )}
        >
          {relativeDayLabel(dayDiff)}
        </span>
      </h3>
      <ul className="flex flex-col gap-2">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              className="flex min-h-14 items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-blu"
              href={event.href}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  KIND_STYLES[event.kind].dot
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {event.title}
                </span>
                {event.subtitle && (
                  <span className="block truncate text-muted-foreground text-xs">
                    {event.subtitle}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 font-medium text-xs",
                  KIND_STYLES[event.kind].chip
                )}
              >
                {event.typeLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CalendarAgenda({
  days,
  todayKey,
}: {
  days: { dateKey: DateKey; events: CalendarEvent[] }[];
  todayKey: DateKey;
}) {
  return (
    <section aria-label="Agenda" className="flex flex-col gap-5">
      <h2 className="font-heading font-medium text-sm">Agenda</h2>
      {days.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No key dates this month.
        </p>
      ) : (
        days.map((day) => (
          <AgendaDay
            dateKey={day.dateKey}
            events={day.events}
            key={day.dateKey}
            todayKey={todayKey}
          />
        ))
      )}
    </section>
  );
}
