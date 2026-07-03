// Client-safe report-filter constants, split from src/lib/reports.ts so the
// filter bar (a client component) never drags the server-only db client into
// the browser bundle.

export const REPORT_PERIOD_OPTIONS = [7, 30, 90] as const;
export const DEFAULT_REPORT_PERIOD_DAYS = 30;

export interface ReportOwnerOption {
  id: string;
  name: string;
}
