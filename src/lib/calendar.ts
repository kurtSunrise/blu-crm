import { AWST_OFFSET_MS, MS_PER_DAY } from "@/lib/format";

// Pure calendar maths for the month view. All "dateKey"/"monthKey" strings
// describe Perth (AWST) calendar days: the +8h shift is applied only in
// awstDateKey and awstMonthRange; everything else is plain UTC date arithmetic
// on those keys. Date-only form inputs land at UTC midnight = 8am AWST, so
// they bucket to the intended Perth day.

export type MonthKey = string; // "YYYY-MM"
export type DateKey = string; // "YYYY-MM-DD"

export const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DATE_KEY_LENGTH = 10;
const MONTH_KEY_LENGTH = 7;
const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;

export const awstDateKey = (date: Date): DateKey =>
  new Date(date.getTime() + AWST_OFFSET_MS)
    .toISOString()
    .slice(0, DATE_KEY_LENGTH);

export const awstMonthKey = (date: Date): MonthKey =>
  awstDateKey(date).slice(0, MONTH_KEY_LENGTH);

const parseMonthKey = (monthKey: MonthKey): { year: number; month: number } => {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, month };
};

// UTC instants bounding the AWST month, for range queries.
export const awstMonthRange = (
  monthKey: MonthKey
): { start: Date; end: Date } => {
  const { year, month } = parseMonthKey(monthKey);
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - AWST_OFFSET_MS),
    end: new Date(Date.UTC(year, month, 1) - AWST_OFFSET_MS),
  };
};

// UTC instants bounding the AWST day, for range queries (mirrors awstMonthRange).
export const awstDayKeyRange = (
  dateKey: DateKey
): { start: Date; end: Date } => {
  const start = new Date(Date.parse(`${dateKey}T00:00:00Z`) - AWST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
};

const utcDateKey = (ms: number): DateKey =>
  new Date(ms).toISOString().slice(0, DATE_KEY_LENGTH);

// Step a dateKey by whole days, for previous/next-day navigation.
export const addDays = (dateKey: DateKey, delta: number): DateKey =>
  utcDateKey(Date.parse(`${dateKey}T00:00:00Z`) + delta * MS_PER_DAY);

// Monday-start weeks covering the month, padded with adjacent-month days.
export const monthGridWeeks = (monthKey: MonthKey): DateKey[][] => {
  const { year, month } = parseMonthKey(monthKey);
  const firstOfMonth = Date.UTC(year, month - 1, 1);
  const firstOfNextMonth = Date.UTC(year, month, 1);
  const mondayOffset = (new Date(firstOfMonth).getUTCDay() + 6) % DAYS_PER_WEEK;
  const gridStart = firstOfMonth - mondayOffset * MS_PER_DAY;

  const weeks: DateKey[][] = [];
  let cursor = gridStart;
  while (cursor < firstOfNextMonth) {
    const week: DateKey[] = [];
    for (let day = 0; day < DAYS_PER_WEEK; day++) {
      week.push(utcDateKey(cursor));
      cursor += MS_PER_DAY;
    }
    weeks.push(week);
  }
  return weeks;
};

export const addMonths = (monthKey: MonthKey, delta: number): MonthKey => {
  const { year, month } = parseMonthKey(monthKey);
  const zeroBased = year * MONTHS_PER_YEAR + (month - 1) + delta;
  const nextYear = Math.floor(zeroBased / MONTHS_PER_YEAR);
  const nextMonth = (zeroBased % MONTHS_PER_YEAR) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
};

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export const monthLabel = (monthKey: MonthKey): string => {
  const { year, month } = parseMonthKey(monthKey);
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
};

const DAY_HEADING_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

// Agenda heading for an AWST dateKey, e.g. "Mon 15 Jun".
export const dateKeyHeading = (dateKey: DateKey): string =>
  DAY_HEADING_FORMATTER.format(new Date(`${dateKey}T00:00:00Z`));

export const dayOfMonth = (dateKey: DateKey): number =>
  Number(dateKey.slice(8, 10));

// Signed whole-day distance between two dateKeys (a minus b).
export const dateKeyDiffDays = (a: DateKey, b: DateKey): number =>
  Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS_PER_DAY
  );
