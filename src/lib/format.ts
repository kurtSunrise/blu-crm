const AUD_FORMATTER = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const CENTS_PER_DOLLAR = 100;

// House rules (PRD §9.5): AUD currency, DD/MM/YYYY dates, AWST times.
const AWST_DATE_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Perth",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const AWST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Perth",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatAudFromCents = (cents: number): string =>
  AUD_FORMATTER.format(cents / CENTS_PER_DOLLAR);

const AUD_COMPACT_FORMATTER = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  notation: "compact",
  maximumFractionDigits: 1,
});

// "$12K" / "$1.2M" — for chart axis ticks where full figures won't fit.
export const formatAudCompactFromCents = (cents: number): string =>
  AUD_COMPACT_FORMATTER.format(cents / CENTS_PER_DOLLAR);

export const dollarsToCents = (dollars: number): number =>
  Math.round(dollars * CENTS_PER_DOLLAR);

export const formatDateAwst = (date: Date): string =>
  AWST_DATE_FORMATTER.format(date);

const AWST_DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Perth",
  day: "2-digit",
  month: "2-digit",
});

// "07/07" — for dense rows where the year is obvious from context.
export const formatDayMonthAwst = (date: Date): string =>
  AWST_DAY_MONTH_FORMATTER.format(date);

// Coerces a Date, ISO string, or anything date-like to a valid ISO string,
// or null when absent/unparseable. Shared by artifact serializers and the
// knowledge source chips.
export const toIsoOrNull = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const MS_PER_DAY = 86_400_000;

// Perth is UTC+8 year-round (no DST), so AWST day boundaries are a fixed
// offset from UTC.
export const AWST_OFFSET_MS = 8 * 60 * 60 * 1000;

// UTC instants bounding "today" as the team experiences it in Perth.
export const awstDayRange = (
  now: Date = new Date()
): { start: Date; end: Date } => {
  const shifted = now.getTime() + AWST_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY;
  const start = new Date(dayStartShifted - AWST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
};

export const formatDateTimeAwst = (date: Date): string =>
  AWST_DATE_TIME_FORMATTER.format(date);

const awstDayIndex = (date: Date): number =>
  Math.floor((date.getTime() + AWST_OFFSET_MS) / MS_PER_DAY);

// Human-friendly wording for a signed distance in whole days:
// "Today", "Tomorrow", "In 5 days", "Yesterday", "5 days ago".
export const relativeDayLabel = (dayDiff: number): string => {
  if (dayDiff === 0) {
    return "Today";
  }
  if (dayDiff === 1) {
    return "Tomorrow";
  }
  if (dayDiff === -1) {
    return "Yesterday";
  }
  return dayDiff > 0 ? `In ${dayDiff} days` : `${-dayDiff} days ago`;
};

// Signed distance between two instants in whole Perth calendar days.
export const awstDayDiff = (date: Date, now: Date = new Date()): number =>
  awstDayIndex(date) - awstDayIndex(now);

// The same wording for two instants, measured in Perth calendar days.
export const formatRelativeDayAwst = (
  date: Date,
  now: Date = new Date()
): string => relativeDayLabel(awstDayDiff(date, now));
