"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type SettingsActionState,
  updateAssistantInstructions,
} from "@/lib/actions/settings-actions";

const MAX_INSTRUCTIONS_LENGTH = 4000;

export function AssistantInstructionsForm({
  instructions,
}: {
  instructions: string;
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateAssistantInstructions, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="assistant-instructions">Instructions</Label>
        <Textarea
          className="min-h-48"
          defaultValue={instructions}
          id="assistant-instructions"
          maxLength={MAX_INSTRUCTIONS_LENGTH}
          name="instructions"
          placeholder={
            "## Email tone\nKeep it short. Lead with the ask, not the relationship..."
          }
          rows={10}
        />
        <p className="text-muted-foreground text-xs">
          Added to the assistant's instructions on every chat. Use it to set
          tone and rules for drafted emails, messages, and call scripts. Leave
          empty to use the defaults.
        </p>
      </div>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p className="text-sm" role="status">
          Instructions saved.
        </p>
      )}
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save instructions"}
      </Button>
    </form>
  );
}
