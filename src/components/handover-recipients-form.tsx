"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateHandoverRecipients } from "@/lib/actions/notification-actions";
import type { SettingsActionState } from "@/lib/actions/settings-actions";

interface RecipientOption {
  email: string;
  id: string;
  name: string;
}

export function HandoverRecipientsForm({
  users,
  selectedIds,
}: {
  users: RecipientOption[];
  selectedIds: string[];
}) {
  const [state, formAction, isPending] = useActionState<
    SettingsActionState,
    FormData
  >(updateHandoverRecipients, {});
  const selected = new Set(selectedIds);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">
          Who receives handover to delivery notifications
        </legend>
        {users.map((option) => (
          <label
            className="flex min-h-11 items-start gap-3 text-sm"
            key={option.id}
          >
            <input
              className="mt-0.5 size-5 accent-blu"
              defaultChecked={selected.has(option.id)}
              name="recipientIds"
              type="checkbox"
              value={option.id}
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{option.name}</span>
              <span className="text-muted-foreground text-xs">
                {option.email}
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
          Recipients saved.
        </p>
      )}
      <Button className="h-12 sm:max-w-48" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save recipients"}
      </Button>
    </form>
  );
}
