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
import { type DealSubStatusOption, subStatusClasses } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

const NOTE_MAX = 2000;

// The label badge. Clickable (opens the editor) when an onClick is supplied;
// otherwise a plain read-only badge for surfaces where editing is turned off.
// The note rides along as the hover title.
export function DealSubStatusBadge({
  status,
  note,
  onClick,
}: {
  status: DealSubStatusOption;
  note: string | null;
  onClick?: () => void;
}) {
  const className = subStatusClasses(status.color).badge;
  if (!onClick) {
    return (
      <Badge className={className} title={note ?? undefined} variant="outline">
        {status.label}
      </Badge>
    );
  }
  return (
    <Badge
      className={className}
      render={
        <button
          aria-label={`Sub-status: ${status.label}. Edit.`}
          onClick={onClick}
          title={note ?? undefined}
          type="button"
        />
      }
      variant="outline"
    >
      {status.label}
    </Badge>
  );
}

export function DealSubStatusControl({
  dealId,
  current,
  note,
  options,
  editable,
  className,
}: {
  dealId: string;
  // The deal's current status, resolved to a row (may be archived); null when
  // the deal is progressing normally.
  current: DealSubStatusOption | null;
  note: string | null;
  // Active statuses offered in the picker, in display order.
  options: DealSubStatusOption[];
  // Whether this surface offers editing (admin placement setting). When false,
  // an existing status still shows as a read-only badge.
  editable: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(current?.id ?? null);
  const [draftNote, setDraftNote] = useState(note ?? "");

  // Sync the form to the current value each time the editor opens.
  useEffect(() => {
    if (open) {
      setSelected(current?.id ?? null);
      setDraftNote(note ?? "");
    }
  }, [open, current, note]);

  const handleSave = () => {
    startTransition(async () => {
      await setDealSubStatus({
        dealId,
        subStatusId: selected,
        note: selected ? draftNote : "",
      });
      setOpen(false);
      router.refresh();
    });
  };

  // Read-only surface: show the badge if set, nothing otherwise.
  if (!editable) {
    if (!current) {
      return null;
    }
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <DealSubStatusBadge note={note} status={current} />
      </div>
    );
  }

  // If the current status has been archived it won't be in `options`; keep it
  // in the picker so it stays visible and selectable (the action allows leaving
  // it unchanged).
  const pickerOptions =
    current && !options.some((option) => option.id === current.id)
      ? [current, ...options]
      : options;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {current ? (
        <DealSubStatusBadge
          note={note}
          onClick={() => setOpen(true)}
          status={current}
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
            {pickerOptions.map((option) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm has-checked:border-blu has-checked:bg-blu/5"
                key={option.id}
              >
                <input
                  checked={selected === option.id}
                  className="size-4 accent-blu"
                  name="sub-status"
                  onChange={() => setSelected(option.id)}
                  type="radio"
                />
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    subStatusClasses(option.color).dot
                  )}
                />
                {option.label}
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
                placeholder="e.g. Waiting on creative from XYZ Agency, expected 25 June"
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
