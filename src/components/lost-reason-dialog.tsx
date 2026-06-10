"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LOST_REASON_OPTIONS } from "@/lib/validation/deal";

export function LostReasonDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Why was this deal lost or parked?</DialogTitle>
          <DialogDescription>
            A reason is recorded with every Lost / Dormant deal.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {LOST_REASON_OPTIONS.map((option) => (
            <Button
              className="h-12 justify-start"
              key={option.value}
              onClick={() => onConfirm(option.value)}
              variant="secondary"
            >
              {option.label}
            </Button>
          ))}
          <Button className="h-12" onClick={onCancel} variant="ghost">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
