"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  createFollowUp,
  type FollowUpActionState,
} from "@/lib/actions/follow-up-actions";

// Date inputs want YYYY-MM-DD; default the due date to today in Perth.
const awstInputDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export function FollowUpForm({
  dealId,
  defaultOwnerId,
  users,
}: {
  dealId: string;
  defaultOwnerId: string | null;
  users: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState<
    FollowUpActionState,
    FormData
  >(createFollowUp, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="dealId" type="hidden" value={dealId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="follow-up-action">Next action *</Label>
        <Input
          className="h-11"
          id="follow-up-action"
          name="action"
          placeholder="e.g. Call back about the revised quote"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="follow-up-owner">Owner *</Label>
          <NativeSelect
            defaultValue={defaultOwnerId ?? users[0]?.id}
            id="follow-up-owner"
            name="ownerId"
            required
          >
            {users.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="follow-up-due">Due *</Label>
          <Input
            className="h-11"
            defaultValue={awstInputDate(new Date())}
            id="follow-up-due"
            name="dueDate"
            required
            type="date"
          />
        </div>
      </div>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      <Button className="h-12" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Add follow-up"}
      </Button>
    </form>
  );
}
