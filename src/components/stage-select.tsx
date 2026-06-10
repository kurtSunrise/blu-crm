"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { moveDealStage } from "@/lib/actions/deal-actions";
import { StageChangeDialog, type StageMoveExtras } from "./stage-change-dialog";

export interface SelectStage {
  id: string;
  isLost: boolean;
  isWon: boolean;
  name: string;
}

export function StageSelect({
  dealId,
  currentStageId,
  stages,
}: {
  dealId: string;
  currentStageId: string;
  stages: SelectStage[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingStage, setPendingStage] = useState<SelectStage | null>(null);

  const applyMove = (stageId: string, extras: StageMoveExtras = {}) => {
    startTransition(async () => {
      await moveDealStage({ dealId, stageId, ...extras });
      router.refresh();
    });
  };

  const handleChange = (stageId: string) => {
    if (stageId === currentStageId) {
      return;
    }
    const stage = stages.find((item) => item.id === stageId);
    if (!stage) {
      return;
    }
    // Won prompts for handover; Lost / Dormant requires a reason (FR-1.6).
    if (stage.isWon || stage.isLost) {
      setPendingStage(stage);
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
      <StageChangeDialog
        onCancel={() => setPendingStage(null)}
        onConfirm={(extras) => {
          if (pendingStage) {
            applyMove(pendingStage.id, extras);
          }
          setPendingStage(null);
        }}
        stage={pendingStage}
      />
    </div>
  );
}
