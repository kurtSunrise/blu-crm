"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  type SettingsActionState,
  updateAiModel,
} from "@/lib/actions/settings-actions";
import { AI_MODEL_OPTIONS } from "@/lib/ai/models";

export function AiModelForm({
  envOverride,
  model,
}: {
  envOverride: boolean;
  model: string;
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateAiModel, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-model">Assistant model</Label>
        <NativeSelect
          className="sm:max-w-sm"
          defaultValue={model}
          id="ai-model"
          name="model"
        >
          {AI_MODEL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        <p className="text-muted-foreground text-xs">
          Which Claude model drafts replies and reads deal files for everyone in
          your workspace. Faster models cost less; more capable models reason
          better on complex, high-stakes messages.
        </p>
      </div>
      {envOverride && (
        <p className="text-muted-foreground text-xs" role="note">
          An <code>AI_MODEL</code> environment variable is set on the server and
          overrides this choice until it is removed.
        </p>
      )}
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p className="text-sm" role="status">
          Model saved.
        </p>
      )}
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save model"}
      </Button>
    </form>
  );
}
