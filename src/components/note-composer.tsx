"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logQuickActivity } from "@/lib/actions/deal-actions";

// Each submission appends a dated, authored note to the deal's timeline
// (activity type "note"), which is also what the AI assistant reads for context.
export function NoteComposer({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  const trimmed = content.trim();

  const addNote = () => {
    if (trimmed === "") {
      return;
    }
    startTransition(async () => {
      await logQuickActivity({ dealId, type: "note", content: trimmed });
      setContent("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground text-xs" htmlFor="deal-note">
        Add a note
      </Label>
      <Textarea
        id="deal-note"
        onChange={(event) => setContent(event.target.value)}
        placeholder="Capture an update, a call summary, or context for the team and the assistant…"
        rows={3}
        value={content}
      />
      <Button
        className="h-12 self-end"
        disabled={isPending || trimmed === ""}
        onClick={addNote}
        type="button"
      >
        {isPending ? "Adding…" : "Add note"}
      </Button>
    </div>
  );
}
