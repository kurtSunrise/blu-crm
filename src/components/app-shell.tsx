"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  HelpCircle,
  Home,
  Inbox,
  KanbanSquare,
  ListTodo,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AiAssistantProvider,
  useAiAssistant,
} from "@/components/ai/ai-context";
import {
  AiAssistantDock,
  AiLauncherButton,
} from "@/components/ai/chat-launcher";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/deals/new", label: "Quick add", icon: Plus },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const SECONDARY_NAV = [
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/help", label: "Help", icon: HelpCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Bottom tabs are a phone pattern: the five core field destinations only.
// Reports and Contacts are sit-down surfaces, reachable from the dashboard
// on phones.
const MOBILE_TAB_HREFS = [
  "/pipeline",
  "/calendar",
  "/inbox",
  "/tasks",
  "/deals/new",
];
const MOBILE_NAV = PRIMARY_NAV.filter((item) =>
  MOBILE_TAB_HREFS.includes(item.href)
);

const isActivePath = (pathname: string, href: string): boolean =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

function SidebarLink({
  item,
  active,
}: {
  item: { href: string; label: string; icon: typeof Home };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-blu"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
      href={item.href}
    >
      <Icon aria-hidden className="size-4.5" />
      {item.label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AiAssistantProvider>
      <AppShellInner>{children}</AppShellInner>
    </AiAssistantProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { open: assistantOpen } = useAiAssistant();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        className="sr-only z-50 rounded-md bg-blu px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        href="#main-content"
      >
        Skip to content
      </a>

      {/* Desktop: persistent sidebar navigation */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-background md:flex">
        <Link className="flex h-14 items-center gap-2 border-b px-4" href="/">
          <BrandMark size={28} />
          <span className="font-heading font-semibold text-lg tracking-tight">
            Blu CRM
          </span>
        </Link>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-3">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink
              active={isActivePath(pathname, item.href)}
              item={item}
              key={item.href}
            />
          ))}
        </nav>
        <nav
          aria-label="Secondary"
          className="flex flex-col gap-1 border-t p-3"
        >
          <AiLauncherButton withLabel />
          {SECONDARY_NAV.map((item) => (
            <SidebarLink
              active={isActivePath(pathname, item.href)}
              item={item}
              key={item.href}
            />
          ))}
          <ThemeToggle withLabel />
        </nav>
      </aside>

      {/* Mobile: sticky header with brand and utilities */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur md:hidden">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link className="flex items-center gap-2" href="/">
            <BrandMark size={32} />
            <span className="font-heading font-semibold text-lg tracking-tight">
              Blu CRM
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <AiLauncherButton />
            {SECONDARY_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  aria-current={
                    isActivePath(pathname, item.href) ? "page" : undefined
                  }
                  aria-label={item.label}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  href={item.href}
                  key={item.href}
                >
                  <Icon aria-hidden className="size-5" />
                </Link>
              );
            })}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div
        className={cn(
          "flex-1 pb-20 md:pb-8 md:pl-60",
          assistantOpen && "md:pr-[400px]"
        )}
        id="main-content"
      >
        {children}
      </div>

      {/* Mobile: bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex w-full max-w-6xl items-stretch justify-around">
          {MOBILE_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li className="flex-1" key={item.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
                    active ? "text-blu" : "text-muted-foreground"
                  )}
                  href={item.href}
                >
                  <Icon aria-hidden className="size-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <AiAssistantDock />
    </div>
  );
}
