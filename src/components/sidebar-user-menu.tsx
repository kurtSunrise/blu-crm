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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { getUserInitials } from "@/lib/user";
import { cn } from "@/lib/utils";

export function SidebarUserMenu({
  name,
  email,
  image = null,
  collapsed = false,
  menuSide = "top",
}: {
  name: string;
  email: string;
  image?: string | null;
  collapsed?: boolean;
  menuSide?: "top" | "bottom";
}) {
  const router = useRouter();
  const [isSigningOut, startSignOut] = useTransition();

  // next-themes resolves the theme only on the client, so render a stable
  // label until mounted to avoid an SSR/client mismatch.
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark = mounted && resolvedTheme === "dark";
  let themeLabel = "Theme";
  if (mounted) {
    themeLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
  }

  const initials = getUserInitials(name, email);

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
        {image ? <AvatarImage alt={name} src={image} /> : null}
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
      <DropdownMenuContent align="end" className="min-w-56" side={menuSide}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0">
            <div className="flex items-center gap-2 px-1.5 py-1.5">
              <Avatar>
                {image ? <AvatarImage alt={name} src={image} /> : null}
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
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings/account" />}>
          <User aria-hidden />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
