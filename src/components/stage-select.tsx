"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { moveDealStage } from "@/lib/actions/deal-actions";

export function StageSelect({
  dealId,
  currentStageId,
  stages,
}: {
  dealId: string;
  currentStageId: string;
  stages: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (stageId: string) => {
    if (stageId === currentStageId) {
      return;
    }
    startTransition(async () => {
      await moveDealStage({ dealId, stageId });
      router.refresh();
    });
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
    </div>
  );
}
