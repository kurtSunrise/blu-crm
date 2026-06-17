"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  type SettingsActionState,
  updateAttachmentDescriptionMode,
} from "@/lib/actions/settings-actions";
import type { AttachmentDescriptionMode } from "@/lib/ai/attachment-describe";

export function AttachmentDescriptionModeForm({
  mode,
}: {
  mode: AttachmentDescriptionMode;
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateAttachmentDescriptionMode, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="description-mode">When to describe deal files</Label>
        <NativeSelect
          className="sm:max-w-sm"
          defaultValue={mode}
          id="description-mode"
          name="mode"
        >
          <option value="lazy">On first view (recommended)</option>
          <option value="eager">In the background on upload</option>
        </NativeSelect>
        <p className="text-muted-foreground text-xs">
          The assistant caches a text description of each photo or file so it
          can recall them cheaply. On first view only describes files the
          assistant actually opens; on upload describes every readable file
          straight away.
        </p>
      </div>
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
