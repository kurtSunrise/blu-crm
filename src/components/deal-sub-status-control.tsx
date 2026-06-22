"use client";

import { CircleDashed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { setDealSubStatus } from "@/lib/actions/deal-actions";
import {
  SUB_STATUS_COLOR,
  SUB_STATUS_LABELS,
  type SubStatus,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SUB_STATUSES } from "@/lib/validation/deal";
import { Badge } from "./ui/badge";

const NOTE_MAX = 2000;

// The label badge, also the button that opens the editor. Shown on the board
// card and the deal page; the note rides along as the hover title.
export function DealSubStatusBadge({
  subStatus,
  note,
  onClick,
}: {
  subStatus: SubStatus;
  note: string | null;
  onClick: () => void;
}) {
  return (
    <Badge
      className={SUB_STATUS_COLOR[subStatus].badge}
      render={
        <button
          aria-label={`Sub-status: ${SUB_STATUS_LABELS[subStatus]}. Edit.`}
          onClick={onClick}
          title={note ?? undefined}
          type="button"
        />
      }
      variant="outline"
    >
      {SUB_STATUS_LABELS[subStatus]}
    </Badge>
  );
}

export function DealSubStatusControl({
  dealId,
  subStatus,
  note,
  className,
}: {
  dealId: string;
  subStatus: SubStatus | null;
  note: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<SubStatus | null>(subStatus);
  const [draftNote, setDraftNote] = useState(note ?? "");

  // Sync the form to the current value each time the editor opens.
  useEffect(() => {
    if (open) {
      setSelected(subStatus);
      setDraftNote(note ?? "");
    }
  }, [open, subStatus, note]);

  const handleSave = () => {
    startTransition(async () => {
      await setDealSubStatus({
        dealId,
        subStatus: selected,
        note: selected ? draftNote : "",
      });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {subStatus ? (
        <DealSubStatusBadge
          note={note}
          onClick={() => setOpen(true)}
          subStatus={subStatus}
        />
      ) : (
        <button
          className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-muted-foreground text-xs transition-colors hover:border-blu hover:text-blu"
          onClick={() => setOpen(true)}
          type="button"
        >
          <CircleDashed aria-hidden className="size-3.5" />
          Add status
        </button>
      )}

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogTitle>Deal status</DialogTitle>
          <DialogDescription>
            Flag a deal that is on hold or blocked, with an optional note on
            why.
          </DialogDescription>

          <fieldset className="flex flex-col gap-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm has-checked:border-blu has-checked:bg-blu/5">
              <input
                checked={selected === null}
                className="size-4 accent-blu"
                name="sub-status"
                onChange={() => setSelected(null)}
                type="radio"
              />
              None (progressing normally)
            </label>
            {SUB_STATUSES.map((value) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm has-checked:border-blu has-checked:bg-blu/5"
                key={value}
              >
                <input
                  checked={selected === value}
                  className="size-4 accent-blu"
                  name="sub-status"
                  onChange={() => setSelected(value)}
                  type="radio"
                />
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    SUB_STATUS_COLOR[value].dot
                  )}
                />
                {SUB_STATUS_LABELS[value]}
              </label>
            ))}
          </fieldset>

          {selected && (
            <div className="flex flex-col gap-1.5">
              <label className="font-medium text-sm" htmlFor="sub-status-note">
                Note (optional)
              </label>
              <Textarea
                id="sub-status-note"
                maxLength={NOTE_MAX}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="e.g. Waiting on creative from XYZ Agency – expected 25 June"
                rows={3}
                value={draftNote}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              className="h-12 flex-1"
              onClick={() => setOpen(false)}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              className="h-12 flex-1"
              disabled={pending}
              onClick={handleSave}
              type="button"
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
