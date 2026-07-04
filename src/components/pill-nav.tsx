import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PillNavLink {
  href: string;
  label: string;
}

// Pill sub-navigation between sibling surfaces (report views, pipeline
// board/closed). `query` carries the current filter params between pages so
// switching views keeps the active filters; `active` may be omitted on pages
// that belong to the family but are not pills themselves (e.g. drill-downs).
export function PillNav({
  active,
  ariaLabel,
  links,
  query,
}: {
  active?: string;
  ariaLabel: string;
  links: readonly PillNavLink[];
  query?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {links.map((link) => (
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
