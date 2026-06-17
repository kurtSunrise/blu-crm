"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type SettingsActionState,
  updatePipelineTooltipSettings,
} from "@/lib/actions/settings-actions";
import type { PipelineTooltipSettings } from "@/lib/pipeline-tooltip";
import { cn } from "@/lib/utils";

const FIELD_OPTIONS = [
  {
    name: "scope",
    label: "Scope summary",
    hint: "A short description of what the job is.",
  },
  {
    name: "contact",
    label: "Last contact and close date",
    hint: "When the deal was last touched and when it is expected to close.",
  },
  {
    name: "followUp",
    label: "Next follow-up",
    hint: "The soonest open follow-up task and its due date.",
  },
] as const;

export function PipelineTooltipForm({
  enabled,
  scope,
  contact,
  followUp,
}: PipelineTooltipSettings) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updatePipelineTooltipSettings, {});
  const [showTooltip, setShowTooltip] = useState(enabled);

  const defaults: Record<(typeof FIELD_OPTIONS)[number]["name"], boolean> = {
    scope,
    contact,
    followUp,
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          checked={showTooltip}
          className="size-5 accent-blu"
          name="enabled"
          onChange={(event) => setShowTooltip(event.target.checked)}
          type="checkbox"
        />
        Show deal details on hover
      </label>

      {/* Kept submittable even when hover is off so a user's field choices
          survive toggling the master switch; dimmed only as a visual cue. */}
      <fieldset
        className={cn(
          "flex flex-col gap-3 border-t pt-4 transition-opacity",
          !showTooltip && "opacity-50"
        )}
      >
        <legend className="sr-only">Fields shown in the tooltip</legend>
        {FIELD_OPTIONS.map((field) => (
          <label
            className="flex min-h-11 items-start gap-3 text-sm"
            key={field.name}
          >
            <input
              aria-label={field.label}
              className="mt-0.5 size-5 accent-blu"
              defaultChecked={defaults[field.name]}
              name={field.name}
              type="checkbox"
            />
            <span className="flex flex-col">
              <span>{field.label}</span>
              <span className="text-muted-foreground text-xs">
                {field.hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p className="text-sm" role="status">
          Preference saved.
        </p>
      )}
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save preference"}
      </Button>
    </form>
  );
}
