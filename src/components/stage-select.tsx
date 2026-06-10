"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LostReasonDialog } from "@/components/lost-reason-dialog";
import { Label } from "@/components/ui/label";
import { moveDealStage } from "@/lib/actions/deal-actions";

export function StageSelect({
  dealId,
  currentStageId,
  stages,
}: {
  dealId: string;
  currentStageId: string;
  stages: { id: string; name: string; isLost: boolean }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingLostStageId, setPendingLostStageId] = useState<string | null>(
    null
  );

  const applyMove = (stageId: string, lostReason?: string) => {
    startTransition(async () => {
      await moveDealStage({ dealId, stageId, lostReason });
      router.refresh();
    });
  };

  const handleChange = (stageId: string) => {
    if (stageId === currentStageId) {
      return;
    }
    const target = stages.find((stage) => stage.id === stageId);
    if (target?.isLost) {
      setPendingLostStageId(stageId);
      return;
    }
    applyMove(stageId);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="stage-select">Stage</Label>
      <select
        className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        disabled={isPending}
        id="stage-select"
        onChange={(event) => handleChange(event.target.value)}
        value={currentStageId}
      >
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
      <LostReasonDialog
        onCancel={() => setPendingLostStageId(null)}
        onConfirm={(reason) => {
          if (pendingLostStageId) {
            applyMove(pendingLostStageId, reason);
          }
          setPendingLostStageId(null);
        }}
        open={pendingLostStageId !== null}
      />
    </div>
  );
}
