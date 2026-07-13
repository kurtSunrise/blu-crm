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

export interface StageConversionStep {
  // Percent of the previous stage's deals that reached this one; null for
  // the first stage.
  conversionFromPrevious: number | null;
  reachedCount: number;
  stageId: string;
}

export interface StageConversionHints {
  cohortCount: number;
  lookbackDays: number;
  steps: StageConversionStep[];
}

const SMALL_SAMPLE_THRESHOLD = 20;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_MONTH = 30;

const conversionHint = (
  step: StageConversionStep,
  cohortCount: number
): string => {
  if (step.conversionFromPrevious === null) {
    return `Reached by ${step.reachedCount} of ${cohortCount} deals`;
  }
  return `Actual: ${step.conversionFromPrevious}% of the previous stage (${step.reachedCount} deals reached)`;
};

export function StageWeightingsForm({
  stages,
  conversion,
}: {
  stages: StageWeightingItem[];
  conversion?: StageConversionHints;
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateStageWeightings, {});

  const hintByStage = new Map(
    (conversion?.steps ?? []).map((step) => [step.stageId, step])
  );
  const showHints = Boolean(conversion && conversion.cohortCount > 0);
  const lookbackMonths = conversion
    ? Math.round(conversion.lookbackDays / DAYS_PER_MONTH)
    : MONTHS_PER_YEAR;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stages.map((stage) => {
          const step = hintByStage.get(stage.id);
          return (
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
              {showHints && step && conversion && (
                <p className="text-muted-foreground text-xs">
                  {conversionHint(step, conversion.cohortCount)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        Each open stage's value counts towards the forecast at this percentage.
        Won is normally 100%, Lost / Dormant 0%.
        {showHints &&
          conversion &&
          ` Conversion hints cover deals created in the last ${lookbackMonths} months.`}
        {showHints &&
          conversion &&
          conversion.cohortCount < SMALL_SAMPLE_THRESHOLD &&
          ` Only ${conversion.cohortCount} deals in that window, so treat the percentages as a guide.`}
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
