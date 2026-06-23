"use client";

import {
  Building2,
  Cpu,
  type LucideIcon,
  Settings,
  Tags,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SettingsTab {
  href: string;
  icon: LucideIcon;
  label: string;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { href: "/settings", label: "General", icon: Settings },
  { href: "/settings/statuses", label: "Deal statuses", icon: Tags },
  { href: "/settings/account", label: "Account", icon: User },
  { href: "/settings/company", label: "Company", icon: Building2 },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/ai", label: "AI Preferences", icon: Cpu },
];

// General is an exact match so deeper tabs (e.g. /settings/account) don't also
// light it up; every other tab also matches its own sub-routes.
function isTabActive(pathname: string, href: string): boolean {
  if (href === "/settings") {
    return pathname === "/settings";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="-mx-1 flex flex-row gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {SETTINGS_TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isTabActive(pathname, tab.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            href={tab.href}
            key={tab.href}
          >
            <Icon aria-hidden className="size-4.5 shrink-0" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

// The page-level H1 sits above the nav + content, so it changes per tab. The
// import sub-route isn't a tab, so it gets its own title.
export function SettingsHeading() {
  const pathname = usePathname();
  const activeTab = SETTINGS_TABS.find((tab) =>
    isTabActive(pathname, tab.href)
  );
  let title = activeTab?.label ?? "Settings";
  if (pathname.startsWith("/settings/import")) {
    title = "CSV import";
  }

  return (
    <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
      {title}
    </h1>
  );
}
