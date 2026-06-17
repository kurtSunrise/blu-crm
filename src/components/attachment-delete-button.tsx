"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

// Remove a deal attachment with a two-step confirm (mirrors ArchiveRecordButton).
// Overlays the file tile so it works inside the mobile photo grid.
export function AttachmentDeleteButton({
  attachmentId,
  fileName,
}: {
  attachmentId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/attachments/${attachmentId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? "Delete failed. Please try again.");
          return;
        }
        setConfirming(false);
        router.refresh();
      } catch {
        setError("Delete failed. Check your connection and try again.");
      }
    });
  };

  if (confirming) {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-md bg-background/95 p-2 text-center">
        <p className="font-medium text-xs">Delete this file?</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            className="h-9"
            disabled={isPending}
            onClick={handleDelete}
            size="sm"
            type="button"
            variant="destructive"
          >
            {isPending ? "Deleting…" : "Delete"}
          </Button>
          <Button
            className="h-9"
            disabled={isPending}
            onClick={() => setConfirming(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </div>
        {error && (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <Button
      aria-label={`Delete ${fileName}`}
      className="absolute top-1 right-1 z-10 size-8 rounded-full bg-background/80 shadow-sm hover:bg-background"
      onClick={() => setConfirming(true)}
      size="icon"
      type="button"
      variant="outline"
    >
      <Trash2 aria-hidden className="size-4 text-destructive" />
    </Button>
  );
}
