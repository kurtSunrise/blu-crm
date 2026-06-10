"use client";

import { KanbanSquare, Plus, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/deals/new", label: "Quick add", icon: Plus },
  { href: "/contacts", label: "Contacts", icon: Users },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link className="flex items-center gap-2" href="/">
            <Image
              alt="Blu Builders logo"
              height={32}
              src="/logo-dark.png"
              width={32}
            />
            <span className="font-heading font-semibold text-lg tracking-tight">
              Blu CRM
            </span>
          </Link>
        </div>
      </header>
      <div className="flex-1 pb-20">{children}</div>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur"
      >
        <ul className="mx-auto flex w-full max-w-6xl items-stretch justify-around">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li className="flex-1" key={item.href}>
                <Link
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
                    isActive ? "text-blu" : "text-muted-foreground"
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
    </div>
  );
}
