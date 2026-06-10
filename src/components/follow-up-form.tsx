"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createFollowUp,
  type FollowUpActionState,
} from "@/lib/actions/follow-up-actions";

export function FollowUpForm({
  dealId,
  owners,
}: {
  dealId: string;
  owners: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState<
    FollowUpActionState,
    FormData
  >(createFollowUp, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="dealId" type="hidden" value={dealId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="follow-up-action">Next action</Label>
        <Input
          className="h-11"
          id="follow-up-action"
          name="action"
          placeholder="e.g. Call back about the quote"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="follow-up-owner">Owner</Label>
          <select
            className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            defaultValue={owners[0]?.id}
            id="follow-up-owner"
            name="ownerId"
            required
          >
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="follow-up-due">Due date</Label>
          <Input
            className="h-11"
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
      <Button className="h-11" disabled={isPending} type="submit">
        {isPending ? "Adding…" : "Add follow-up"}
      </Button>
    </form>
  );
}
