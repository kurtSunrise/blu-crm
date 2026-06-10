"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type SettingsActionState,
  updateAlertThresholds,
} from "@/lib/actions/settings-actions";

export function AlertThresholdsForm({
  staleDays,
  closingSoonDays,
}: {
  staleDays: number;
  closingSoonDays: number;
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateAlertThresholds, {});

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
            Open deals with no contact for this many days surface as needing
            attention.
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
