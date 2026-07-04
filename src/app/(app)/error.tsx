"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Route-level boundary for everything inside the app shell. Most errors it
// catches are transient infrastructure failures (a Neon blip, a stalled
// render on workerd), so the copy leads with "try again".
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces the digest in Workers observability alongside the
    // [hang-watchdog] and [action-error] log lines.
    console.error("[app-error]", error.digest ?? error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="font-heading font-semibold text-2xl">
        Something went wrong
      </h1>
      <p className="text-muted-foreground text-sm">
        This page hit an unexpected error. It is usually temporary, so try again
        in a moment.
      </p>
      <Button onClick={reset} size="lg">
        <RotateCcw aria-hidden className="size-4" />
        Try again
      </Button>
    </div>
  );
}
