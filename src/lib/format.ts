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

// AWST is UTC+8 year-round (no daylight saving), so day boundaries can be
// computed with a fixed offset.
const AWST_OFFSET_MS = 8 * 3_600_000;
const MS_PER_DAY = 86_400_000;

export const startOfTodayAwst = (): Date => {
  const nowAwst = new Date(Date.now() + AWST_OFFSET_MS);
  const midnightUtc = Date.UTC(
    nowAwst.getUTCFullYear(),
    nowAwst.getUTCMonth(),
    nowAwst.getUTCDate()
  );
  return new Date(midnightUtc - AWST_OFFSET_MS);
};

export const endOfTodayAwst = (): Date =>
  new Date(startOfTodayAwst().getTime() + MS_PER_DAY);

export const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * MS_PER_DAY);

export const formatAudFromCents = (cents: number): string =>
  AUD_FORMATTER.format(cents / CENTS_PER_DOLLAR);

export const dollarsToCents = (dollars: number): number =>
  Math.round(dollars * CENTS_PER_DOLLAR);

export const formatDateAwst = (date: Date): string =>
  AWST_DATE_FORMATTER.format(date);

export const MS_PER_DAY = 86_400_000;

// Perth is UTC+8 year-round (no DST), so AWST day boundaries are a fixed
// offset from UTC.
const AWST_OFFSET_MS = 8 * 60 * 60 * 1000;

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
