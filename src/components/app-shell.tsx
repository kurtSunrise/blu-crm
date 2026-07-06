"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  Ellipsis,
  HelpCircle,
  Home,
  Inbox,
  KanbanSquare,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AiAssistantProvider,
  useAiAssistant,
} from "@/components/ai/ai-context";
import {
  AiAssistantDock,
  AiLauncherButton,
} from "@/components/ai/chat-launcher";
import { BrandMark } from "@/components/brand-mark";
import {
  NotificationBadge,
  unreadAriaLabel,
  useUnreadNotificationCount,
} from "@/components/notification-bell";
import { SidebarUserMenu } from "@/components/sidebar-user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { setSidebarCollapsed } from "@/lib/sidebar-actions";
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
];

// Bottom tabs are a phone pattern: the five core field destinations get
// their own tab, and the rest of the primary nav (Dashboard, Contacts,
// Reports) lives in the trailing "More" dropdown so every desktop sidebar
// destination stays one tap away on phones.
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
const MOBILE_MORE_HREFS = ["/", "/contacts", "/reports"];
const MOBILE_MORE_NAV = PRIMARY_NAV.filter((item) =>
  MOBILE_MORE_HREFS.includes(item.href)
);

const isActivePath = (pathname: string, href: string): boolean => {
  if (href === "/") {
    return pathname === "/";
  }
  // Deal detail pages belong to the pipeline conceptually; without this they
  // would highlight nothing (Quick add owns /deals/new and keeps its own).
  if (
    href === "/pipeline" &&
    pathname.startsWith("/deals/") &&
    !pathname.startsWith("/deals/new")
  ) {
    return true;
  }
  return pathname.startsWith(href);
};

function SidebarLink({
  item,
  active,
  collapsed,
  badgeCount = 0,
}: {
  item: { href: string; label: string; icon: typeof Home };
  active: boolean;
  collapsed: boolean;
  badgeCount?: number;
}) {
  const Icon = item.icon;
  // Collapsed links always need a label; expanded ones only when the unread
  // count is not visible as text.
  const ariaLabel =
    collapsed || badgeCount > 0
      ? unreadAriaLabel(item.label, badgeCount)
      : undefined;
  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-accent font-medium text-blu"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
      href={item.href}
    >
      <span className="relative">
        <Icon aria-hidden className="size-4.5" />
        <NotificationBadge count={badgeCount} />
      </span>
      {collapsed ? null : item.label}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

export function AppShell({
  children,
  userName,
  userEmail,
  userImage = null,
  defaultCollapsed = false,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userImage?: string | null;
  defaultCollapsed?: boolean;
}) {
  return (
    <AiAssistantProvider>
      <AppShellInner
        defaultCollapsed={defaultCollapsed}
        userEmail={userEmail}
        userImage={userImage}
        userName={userName}
      >
        {children}
      </AppShellInner>
    </AiAssistantProvider>
  );
}

function AppShellInner({
  children,
  userName,
  userEmail,
  userImage,
  defaultCollapsed,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userImage: string | null;
  defaultCollapsed: boolean;
}) {
  const pathname = usePathname();
  const { open: assistantOpen, setOpen: setAssistantOpen } = useAiAssistant();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  // One poller serves both the desktop sidebar and the mobile header badge.
  const unreadCount = useUnreadNotificationCount(pathname);

  const toggleSidebar = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    // Persist via a server action; a failed cookie write only affects the
    // next page load's initial state, so a rejection is non-fatal here.
    setSidebarCollapsed(next).catch(() => {
      // Intentionally ignored: persistence is best-effort.
    });
  }, [collapsed]);

  // Cmd/Ctrl+B toggles the sidebar (the common editor shortcut) and
  // Cmd/Ctrl+J toggles the assistant dock (Cmd+K stays reserved for a
  // future command palette).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      if (event.key === "b") {
        event.preventDefault();
        toggleSidebar();
      }
      if (event.key === "j") {
        event.preventDefault();
        setAssistantOpen(!assistantOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar, assistantOpen, setAssistantOpen]);

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col">
        <a
          className="sr-only z-50 rounded-md bg-blu px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          href="#main-content"
        >
          Skip to content
        </a>

        {/* Desktop: persistent sidebar navigation */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden flex-col border-r bg-background transition-[width] md:flex",
            collapsed ? "w-16" : "w-60"
          )}
        >
          <div
            className={cn(
              "flex h-14 items-center border-b px-3",
              collapsed ? "justify-center" : "gap-2"
            )}
          >
            {collapsed ? null : (
              <Link className="flex flex-1 items-center gap-2 px-1" href="/">
                <BrandMark size={28} />
                <span className="font-heading font-semibold text-lg tracking-tight">
                  Blu CRM
                </span>
              </Link>
            )}
            <button
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              onClick={toggleSidebar}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden className="size-5" />
              ) : (
                <PanelLeftClose aria-hidden className="size-5" />
              )}
            </button>
          </div>
          <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-3">
            {PRIMARY_NAV.map((item) => (
              <SidebarLink
                active={isActivePath(pathname, item.href)}
                collapsed={collapsed}
                item={item}
                key={item.href}
              />
            ))}
          </nav>
          <nav
            aria-label="Secondary"
            className="flex flex-col gap-1 border-t p-3"
          >
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger render={<AiLauncherButton />} />
                <TooltipContent side="right">Assistant (⌘J)</TooltipContent>
              </Tooltip>
            ) : (
              <AiLauncherButton withLabel />
            )}
            {SECONDARY_NAV.map((item) => (
              <SidebarLink
                active={isActivePath(pathname, item.href)}
                badgeCount={item.href === "/notifications" ? unreadCount : 0}
                collapsed={collapsed}
                item={item}
                key={item.href}
              />
            ))}
            <SidebarUserMenu
              collapsed={collapsed}
              email={userEmail}
              image={userImage}
              name={userName}
            />
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
                const badgeCount =
                  item.href === "/notifications" ? unreadCount : 0;
                return (
                  <Link
                    aria-current={
                      isActivePath(pathname, item.href) ? "page" : undefined
                    }
                    aria-label={unreadAriaLabel(item.label, badgeCount)}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    href={item.href}
                    key={item.href}
                  >
                    <span className="relative">
                      <Icon aria-hidden className="size-5" />
                      <NotificationBadge count={badgeCount} />
                    </span>
                  </Link>
                );
              })}
              <SidebarUserMenu
                collapsed
                email={userEmail}
                image={userImage}
                menuSide="bottom"
                name={userName}
              />
            </div>
          </div>
        </header>

        <div
          className={cn(
            "flex-1 pb-20 transition-[padding] md:pb-8",
            collapsed ? "md:pl-16" : "md:pl-60",
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
            <li className="flex-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "flex min-h-14 w-full flex-col items-center justify-center gap-1 text-xs",
                    MOBILE_MORE_NAV.some((item) =>
                      isActivePath(pathname, item.href)
                    )
                      ? "text-blu"
                      : "text-muted-foreground"
                  )}
                >
                  <Ellipsis aria-hidden className="size-5" />
                  More
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top">
                  {MOBILE_MORE_NAV.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        render={
                          <Link
                            aria-current={
                              isActivePath(pathname, item.href)
                                ? "page"
                                : undefined
                            }
                            href={item.href}
                          />
                        }
                      >
                        <Icon aria-hidden />
                        {item.label}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuItem onClick={() => setAssistantOpen(true)}>
                    <Sparkles aria-hidden />
                    Assistant
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          </ul>
        </nav>

        <AiAssistantDock />
      </div>
    </TooltipProvider>
  );
}
