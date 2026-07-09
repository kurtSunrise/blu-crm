"use client";

import { Archive } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Soft delete with a two-step confirm (PRD §7, no hard deletes). The
// server action is bound to the record by the calling server component.
export function ArchiveRecordButton({
  action,
  confirmCopy,
  triggerLabel,
}: {
  action: () => Promise<void>;
  confirmCopy: string;
  triggerLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button
        className="h-11 w-fit gap-2 text-destructive"
        onClick={() => setConfirming(true)}
        type="button"
        variant="outline"
      >
        <Archive aria-hidden className="size-4" />
        {triggerLabel}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm">{confirmCopy}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          className="h-11"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              // A successful archive redirects (which throws to navigate, and
              // is confirmed by a flash toast on the list). If the action
              // resolves without redirecting, it failed silently — say so.
              try {
                await action();
                toast.error("Couldn't archive. Please try again.");
              } catch (error) {
                unstable_rethrow(error);
                toast.error("Couldn't archive. Please try again.");
              }
            })
          }
          type="button"
          variant="destructive"
        >
          {isPending ? "Archiving…" : "Yes, archive"}
        </Button>
        <Button
          className="h-11"
          onClick={() => setConfirming(false)}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
