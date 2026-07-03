import Link from "next/link";
import { cn } from "@/lib/utils";

const REPORT_LINKS = [
  { href: "/reports", label: "Overview" },
  { href: "/reports/trends", label: "Trends" },
  { href: "/reports/weekly", label: "Weekly" },
  { href: "/reports/daily", label: "Daily" },
] as const;

export type ReportsNavKey = (typeof REPORT_LINKS)[number]["href"];

// Pill navigation across the report surfaces. `query` carries the active
// filter set between pages so switching views keeps the current period/owner.
export function ReportsNav({
  active,
  query,
}: {
  active: ReportsNavKey;
  query?: string;
}) {
  return (
    <nav aria-label="Report views" className="flex flex-wrap gap-2">
      {REPORT_LINKS.map((link) => (
        <Link
          aria-current={link.href === active ? "page" : undefined}
          className={cn(
            "flex min-h-9 items-center rounded-full border px-4 font-medium text-sm transition-colors",
            link.href === active
              ? "border-blu bg-blu/10 text-blu"
              : "text-muted-foreground hover:bg-accent"
          )}
          href={query ? `${link.href}?${query}` : link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
