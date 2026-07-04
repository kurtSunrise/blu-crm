import { PillNav } from "@/components/pill-nav";

const REPORT_LINKS = [
  { href: "/reports", label: "Overview" },
  { href: "/reports/trends", label: "Trends" },
  { href: "/reports/funnel", label: "Funnel" },
  { href: "/reports/team", label: "Team" },
  { href: "/reports/weekly", label: "Weekly" },
  { href: "/reports/daily", label: "Daily" },
] as const;

export type ReportsNavKey = (typeof REPORT_LINKS)[number]["href"];

// Pill navigation across the report surfaces. `query` carries the active
// filter set between pages so switching views keeps the current period/owner.
// `active` is omitted on report pages that are not pills themselves (the
// /reports/deals drill-down).
export function ReportsNav({
  active,
  query,
}: {
  active?: ReportsNavKey;
  query?: string;
}) {
  return (
    <PillNav
      active={active}
      ariaLabel="Report views"
      links={REPORT_LINKS}
      query={query}
    />
  );
}
