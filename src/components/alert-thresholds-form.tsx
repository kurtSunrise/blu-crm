"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  type SettingsActionState,
  updateAlertThresholds,
} from "@/lib/actions/settings-actions";
import { cn } from "@/lib/utils";

export interface AutomationStageOption {
  id: string;
  name: string;
}

export function AlertThresholdsForm({
  staleDays,
  closingSoonDays,
  staleNudgeEnabled,
  staleNudgeRepeatDays,
  quoteNudgeEnabled,
  quoteNudgeDays,
  autoFollowUpStageId,
  autoFollowUpDays,
  stages,
}: {
  staleDays: number;
  closingSoonDays: number;
  staleNudgeEnabled: boolean;
  staleNudgeRepeatDays: number;
  quoteNudgeEnabled: boolean;
  quoteNudgeDays: number;
  autoFollowUpStageId: string | null;
  autoFollowUpDays: number;
  // Open stages only; Won and Lost / Dormant are not valid chase triggers.
  stages: AutomationStageOption[];
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateAlertThresholds, {});
  const [nudgeOn, setNudgeOn] = useState(staleNudgeEnabled);
  const [quoteNudgeOn, setQuoteNudgeOn] = useState(quoteNudgeEnabled);
  const [autoFollowUpStage, setAutoFollowUpStage] = useState(
    autoFollowUpStageId ?? ""
  );

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
            min={1}
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

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="sr-only">
          Quote awaiting response notification
        </legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            checked={quoteNudgeOn}
            className="size-5 accent-blu"
            name="quoteNudgeEnabled"
            onChange={(event) => setQuoteNudgeOn(event.target.checked)}
            type="checkbox"
          />
          Send "Quote awaiting response" notifications
        </label>
        <div
          className={cn(
            "flex flex-col gap-2 transition-opacity",
            !quoteNudgeOn && "opacity-50"
          )}
        >
          <Label htmlFor="quote-nudge-days">Nudge after (days)</Label>
          <Input
            className="h-11 sm:max-w-48"
            defaultValue={quoteNudgeDays}
            disabled={!quoteNudgeOn}
            id="quote-nudge-days"
            inputMode="numeric"
            max={365}
            min={0}
            name="quoteNudgeDays"
            required
            type="number"
          />
          <p className="text-muted-foreground text-xs">
            When a sent quote has had no acceptance or decline for this many
            days, the deal owner gets a nudge to chase it. A quote that is only
            viewed still counts as awaiting a response.
          </p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="sr-only">Stage-entry follow-up automation</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="auto-follow-up-stage">
              Auto follow-up when a deal enters
            </Label>
            <NativeSelect
              id="auto-follow-up-stage"
              name="autoFollowUpStageId"
              onChange={(event) => setAutoFollowUpStage(event.target.value)}
              value={autoFollowUpStage}
            >
              <option value="">Off</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div
            className={cn(
              "flex flex-col gap-2 transition-opacity",
              !autoFollowUpStage && "opacity-50"
            )}
          >
            <Label htmlFor="auto-follow-up-days">Due in (days)</Label>
            <Input
              className="h-11"
              defaultValue={autoFollowUpDays}
              disabled={!autoFollowUpStage}
              id="auto-follow-up-days"
              inputMode="numeric"
              max={365}
              min={0}
              name="autoFollowUpDays"
              required={Boolean(autoFollowUpStage)}
              type="number"
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          When a deal moves into the chosen stage and has no open follow-up, a
          chase follow-up is created automatically for the deal owner, due this
          many days later. Choose Off to disable the automation.
        </p>
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
