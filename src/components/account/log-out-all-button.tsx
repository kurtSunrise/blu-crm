"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// Revokes every session for this member (including the current one), so all
// devices are signed out, then sends this device to the sign-in page.
export function LogOutAllButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const logOutAll = () =>
    startTransition(async () => {
      await authClient.revokeSessions();
      router.push("/sign-in");
      router.refresh();
    });

  return (
    <Button
      className="h-10 px-4"
      disabled={isPending}
      onClick={logOutAll}
      type="button"
      variant="outline"
    >
      {isPending ? "Signing out…" : "Log Out All"}
    </Button>
  );
}
