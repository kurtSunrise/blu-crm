"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const signOut = () =>
    startTransition(async () => {
      await authClient.signOut();
      router.push("/sign-in");
      router.refresh();
    });

  return (
    <button
      aria-label="Sign out"
      className={
        compact
          ? "flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          : "flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-muted-foreground text-sm transition-colors hover:bg-accent/50 hover:text-foreground"
      }
      disabled={isPending}
      onClick={signOut}
      type="button"
    >
      <LogOut aria-hidden className={compact ? "size-5" : "size-4.5"} />
      {!compact && (isPending ? "Signing out…" : "Sign out")}
    </button>
  );
}
