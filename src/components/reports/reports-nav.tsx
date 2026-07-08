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
  // Pin the switcher under the mobile app-shell header (h-14) so it stays
  // reachable down long report pages, matching the pipeline/contacts filter
  // bars. The -mx-4/px-4 bleed lets the pinned bar span the page padding.
  return (
    <div className="sticky top-14 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur md:top-0">
      <PillNav
        active={active}
        ariaLabel="Report views"
        links={REPORT_LINKS}
        query={query}
      />
    </div>
  );
}
