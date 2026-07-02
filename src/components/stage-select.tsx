"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      try {
        const result = await moveDealStage({ dealId, stageId, ...extras });
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        router.refresh();
        toast.success("Stage updated");
      } catch {
        toast.error("Couldn't change the stage. Please try again.");
      }
    });
  };

  const handleChange = (stageId: string | null) => {
    if (!stageId || stageId === currentStageId) {
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
      <Select
        disabled={isPending}
        items={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
        onValueChange={handleChange}
        value={currentStageId}
      >
        <SelectTrigger
          className="w-full px-3 data-[size=default]:h-11"
          id="stage-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
