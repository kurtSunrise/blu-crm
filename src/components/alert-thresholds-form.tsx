"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type SettingsActionState,
  updateAlertThresholds,
} from "@/lib/actions/settings-actions";
import { cn } from "@/lib/utils";

export function AlertThresholdsForm({
  staleDays,
  closingSoonDays,
  staleNudgeEnabled,
  staleNudgeRepeatDays,
}: {
  staleDays: number;
  closingSoonDays: number;
  staleNudgeEnabled: boolean;
  staleNudgeRepeatDays: number;
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateAlertThresholds, {});
  const [nudgeOn, setNudgeOn] = useState(staleNudgeEnabled);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="stale-days">Needs attention after (days)</Label>
          <Input
            className="h-11"
            defaultValue={staleDays}
            id="stale-days"
            inputMode="numeric"
            max={365}
            min={0}
            name="staleDays"
            required
            type="number"
          />
          <p className="text-muted-foreground text-xs">
            An open deal with no logged contact for this many days surfaces as
            needing attention and triggers a "Deal needs attention"
            notification. Logging a call, email, note, follow-up, quote, or a
            stage change resets the clock.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="closing-soon-days">Closing soon within (days)</Label>
          <Input
            className="h-11"
            defaultValue={closingSoonDays}
            id="closing-soon-days"
            inputMode="numeric"
            max={365}
            min={0}
            name="closingSoonDays"
            required
            type="number"
          />
          <p className="text-muted-foreground text-xs">
            Deals with a fixed date or expected close inside this window surface
            as closing soon.
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="sr-only">Needs-attention notification</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            checked={nudgeOn}
            className="size-5 accent-blu"
            name="staleNudgeEnabled"
            onChange={(event) => setNudgeOn(event.target.checked)}
            type="checkbox"
          />
          Send "Deal needs attention" notifications
        </label>
        <div
          className={cn(
            "flex flex-col gap-2 transition-opacity",
            !nudgeOn && "opacity-50"
          )}
        >
          <Label htmlFor="stale-nudge-repeat-days">
            Remind again every (days)
          </Label>
          <Input
            className="h-11 sm:max-w-48"
            defaultValue={staleNudgeRepeatDays}
            disabled={!nudgeOn}
            id="stale-nudge-repeat-days"
            inputMode="numeric"
            max={365}
            min={0}
            name="staleNudgeRepeatDays"
            required
            type="number"
          />
          <p className="text-muted-foreground text-xs">
            Leave at 0 to nudge once when a deal goes stale. Set a number to
            re-send the reminder every that many days until the deal is
            contacted.
          </p>
        </div>
      </fieldset>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p className="text-sm" role="status">
          Thresholds saved.
        </p>
      )}
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save thresholds"}
      </Button>
    </form>
  );
}
