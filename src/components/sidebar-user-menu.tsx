"use client";

import { ChevronsUpDown, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { getUserInitials } from "@/lib/user";
import { cn } from "@/lib/utils";

export function SidebarUserMenu({
  name,
  email,
  image = null,
  collapsed = false,
}: {
  name: string;
  email: string;
  image?: string | null;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [isSigningOut, startSignOut] = useTransition();

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
      <DropdownMenuContent align="end" className="min-w-56" side="top">
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
