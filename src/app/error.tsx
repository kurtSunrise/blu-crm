"use client";

import { useEffect } from "react";

// Root-segment boundary. Errors thrown by the (app) layout itself (for
// example the session lookup failing) bypass (app)/error.tsx and land here;
// the root layout with theme and fonts still renders around this.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error.digest ?? error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading font-semibold text-2xl">
        Something went wrong
      </h1>
      <p className="text-muted-foreground text-sm">
        Blu CRM hit an unexpected error. It is usually temporary, so try again
        in a moment.
      </p>
      <button
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 font-medium text-primary-foreground text-sm"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </main>
  );
}
