"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { LOST_REASON_LABELS, type LostReason } from "@/lib/labels";
import { LOST_REASONS } from "@/lib/validation/deal";

export interface StageMoveExtras {
  handoverToDelivery?: boolean;
  lostReason?: LostReason;
}

export interface PendingStage {
  isLost: boolean;
  isWon: boolean;
  name: string;
}

// Won prompts for the handover-to-delivery flag; Lost / Dormant requires a
// reason before the move applies (FR-1.6).
export function StageChangeDialog({
  stage,
  onConfirm,
  onCancel,
}: {
  stage: PendingStage | null;
  onConfirm: (extras: StageMoveExtras) => void;
  onCancel: () => void;
}) {
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [handover, setHandover] = useState(true);

  // Reset the form whenever a new move is requested.
  useEffect(() => {
    if (stage) {
      setLostReason("");
      setHandover(true);
    }
  }, [stage]);

  const open = stage !== null;
  const confirmDisabled = Boolean(stage?.isLost) && lostReason === "";

  const handleConfirm = () => {
    if (!stage) {
      return;
    }
    if (stage.isLost) {
      if (lostReason === "") {
        return;
      }
      onConfirm({ lostReason });
      return;
    }
    onConfirm({ handoverToDelivery: handover });
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent>
        <DialogTitle>
          {stage?.isLost ? "Mark as Lost / Dormant" : "Mark as Won"}
        </DialogTitle>
        <DialogDescription>
          {stage?.isLost
            ? "Record why this deal was lost or parked. A reason is required."
            : "Nice one. Flag the handover so delivery picks the job up."}
        </DialogDescription>

        {stage?.isLost ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="lost-reason">Reason *</Label>
            <NativeSelect
              id="lost-reason"
              onChange={(event) =>
                setLostReason(event.target.value as LostReason | "")
              }
              value={lostReason}
            >
              <option disabled value="">
                Choose a reason…
              </option>
              {LOST_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {LOST_REASON_LABELS[reason]}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              checked={handover}
              className="size-5 accent-blu"
              name="handoverToDelivery"
              onChange={(event) => setHandover(event.target.checked)}
              type="checkbox"
            />
            Flag handover to delivery (notifies Kurt)
          </label>
        )}

        <div className="flex gap-2">
          <Button
            className="h-12 flex-1"
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            className="h-12 flex-1"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            type="button"
          >
            {stage?.isLost ? "Mark as lost" : "Mark as won"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
