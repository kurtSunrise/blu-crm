"use client";

import {
  ChevronsUpDown,
  LogOut,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const WHITESPACE_RE = /\s+/;

// Initials for the avatar fallback: first + last name initials, else the first
// two name characters, else the first two email characters.
function getUserInitials(name: string, email: string): string {
  const trimmedName = name.trim();
  if (trimmedName) {
    const parts = trimmedName.split(WHITESPACE_RE);
    if (parts.length >= 2) {
      const first = parts[0].charAt(0);
      const last = (parts.at(-1) ?? "").charAt(0);
      return `${first}${last}`.toUpperCase();
    }
    return trimmedName.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "?";
}

export function SidebarUserMenu({
  name,
  email,
  collapsed = false,
}: {
  name: string;
  email: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  const initials = getUserInitials(name, email);
  const isDark = mounted && resolvedTheme === "dark";
  let themeLabel = "Theme";
  if (mounted) {
    themeLabel = isDark ? "Light mode" : "Dark mode";
  }

  const signOut = () =>
    startSignOut(async () => {
      await authClient.signOut();
      router.push("/sign-in");
      router.refresh();
    });

  const triggerClassName = cn(
    "flex min-h-11 w-full items-center gap-2 rounded-md p-2 text-sm transition-colors hover:bg-accent/50 data-[popup-open]:bg-accent",
    collapsed && "justify-center"
  );

  const triggerInner = (
    <>
      <Avatar>
        <AvatarFallback className="bg-primary font-medium text-primary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      {collapsed ? null : (
        <>
          <span className="flex-1 truncate text-left font-medium">{name}</span>
          <ChevronsUpDown
            aria-hidden
            className="ml-auto size-4 shrink-0 text-muted-foreground"
          />
        </>
      )}
    </>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                aria-label={`Account menu for ${name}`}
                className={triggerClassName}
              />
            }
          >
            {triggerInner}
          </TooltipTrigger>
          <TooltipContent side="right">{name}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger
          aria-label={`Account menu for ${name}`}
          className={triggerClassName}
        >
          {triggerInner}
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" className="min-w-56" side="top">
        <DropdownMenuLabel className="p-0">
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <Avatar>
              <AvatarFallback className="bg-primary font-medium text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left">
              <span className="truncate font-medium text-foreground">
                {name}
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <User aria-hidden />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
          {themeLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSigningOut}
          onClick={signOut}
          variant="destructive"
        >
          <LogOut aria-hidden />
          {isSigningOut ? "Signing out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
