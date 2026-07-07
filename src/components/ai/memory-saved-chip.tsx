"use client";

import { BookmarkCheckIcon, Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disableMemoryAction } from "@/lib/actions/memory-actions";

// The live `memory_saved` stream payload and the persisted "memory_saved"
// artifact carry the same keys, so one loosely-typed shape covers streaming
// and thread resume. Guarded fields because persisted artifact data is
// untyped jsonb.
export interface MemorySavedData {
  content?: string;
  memoryId?: string;
}

// After a resume the memory may already be disabled server-side (the user
// undid it in another session); a not-found result means "already gone", and
// the muted removed state is the honest outcome, not an error.
const NOT_FOUND_PATTERN = /not found|no longer exists|already removed/i;

// Inline banner under the answer when the assistant auto-saved a memory
// (save_memory runs inline, not confirmation-gated), with a one-tap Undo
// that disables the row. Undo is local-state only: the chip swaps to a muted
// "Memory removed" card and the settings memory list stops showing the row
// on its next load.
export function MemorySavedChip({ data }: { data: MemorySavedData }) {
  const [removed, setRemoved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const memoryId = typeof data.memoryId === "string" ? data.memoryId : null;
  const content = typeof data.content === "string" ? data.content : "";
  if (!memoryId) {
    return null;
  }

  if (removed) {
    return (
      <div
        className="my-1.5 w-full rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-xs"
        role="status"
      >
        Memory removed. The assistant will not use it again.
      </div>
    );
  }

  const undo = () => {
    startTransition(async () => {
      const result = await disableMemoryAction({ memoryId });
      if (result.error && !NOT_FOUND_PATTERN.test(result.error)) {
        toast.error(result.error);
        return;
      }
      setRemoved(true);
    });
  };

  return (
    <div className="my-1.5 flex w-full items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2">
      <BookmarkCheckIcon aria-hidden className="size-4 shrink-0 text-blu" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-xs">Memory saved</p>
        <p className="mt-0.5 break-words text-muted-foreground text-xs leading-relaxed">
          {content}
        </p>
      </div>
      <Button
        aria-label="Undo saved memory"
        className="min-h-11 shrink-0 px-3"
        disabled={isPending}
        onClick={undo}
        size="sm"
        type="button"
        variant="outline"
      >
        {isPending ? (
          <Loader2Icon aria-hidden className="size-3.5 animate-spin" />
        ) : null}
        Undo
      </Button>
    </div>
  );
}
