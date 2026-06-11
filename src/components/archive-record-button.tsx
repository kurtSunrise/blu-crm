"use client";

import { Archive } from "lucide-react";
import { useState, useTransition } from "react";
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
              await action();
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
