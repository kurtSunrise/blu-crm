"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type SettingsActionState,
  updateStageWeightings,
} from "@/lib/actions/settings-actions";

export interface StageWeightingItem {
  id: string;
  name: string;
  weighting: number;
}

export function StageWeightingsForm({
  stages,
}: {
  stages: StageWeightingItem[];
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateStageWeightings, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stages.map((stage) => (
          <div className="flex flex-col gap-2" key={stage.id}>
            <Label htmlFor={`weighting-${stage.id}`}>{stage.name} (%)</Label>
            <Input
              className="h-11"
              defaultValue={stage.weighting}
              id={`weighting-${stage.id}`}
              inputMode="numeric"
              max={100}
              min={0}
              name={`weighting-${stage.id}`}
              required
              type="number"
            />
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Each open stage's value counts towards the forecast at this percentage.
        Won is normally 100%, Lost / Dormant 0%.
      </p>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p className="text-sm" role="status">
          Weightings saved.
        </p>
      )}
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save weightings"}
      </Button>
    </form>
  );
}
