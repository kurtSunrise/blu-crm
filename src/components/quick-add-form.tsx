"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  type ActionState,
  createQuickAddDeal,
} from "@/lib/actions/deal-actions";

const PROJECT_TYPE_OPTIONS = [
  { value: "fit_out", label: "Fit-out" },
  { value: "retail_display", label: "Retail display" },
  { value: "event_stand", label: "Event stand" },
  { value: "exhibition", label: "Exhibition" },
  { value: "install", label: "Install" },
  { value: "themed_build", label: "Themed build" },
  { value: "other", label: "Other" },
];

export function QuickAddForm({
  owners,
}: {
  owners: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createQuickAddDeal,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="companyName">Client / brand *</Label>
        <Input
          autoFocus
          className="h-11"
          id="companyName"
          name="companyName"
          placeholder="e.g. Westfield"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="contactName">Contact name</Label>
        <Input className="h-11" id="contactName" name="contactName" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contactPhone">Phone</Label>
          <Input
            className="h-11"
            id="contactPhone"
            inputMode="tel"
            name="contactPhone"
            type="tel"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contactEmail">Email</Label>
          <Input
            className="h-11"
            id="contactEmail"
            name="contactEmail"
            type="email"
          />
        </div>
      </div>
      <p className="-mt-2 text-muted-foreground text-xs">
        Phone or email — at least one.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="projectType">Project type</Label>
          <NativeSelect defaultValue="" id="projectType" name="projectType">
            <option value="">Not sure yet</option>
            {PROJECT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="estimatedValueDollars">Value guess (AUD)</Label>
          <Input
            className="h-11"
            id="estimatedValueDollars"
            inputMode="numeric"
            min="0"
            name="estimatedValueDollars"
            step="any"
            type="number"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fixedDate">Fixed date (install / event)</Label>
          <Input className="h-11" id="fixedDate" name="fixedDate" type="date" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ownerId">Owner</Label>
          <NativeSelect defaultValue="" id="ownerId" name="ownerId">
            <option value="">Unassigned</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="scopeSummary">What do they want?</Label>
        <Textarea
          id="scopeSummary"
          name="scopeSummary"
          placeholder="Christmas retail display at Carousel…"
          rows={3}
        />
      </div>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      <Button className="h-12 text-base" disabled={isPending} type="submit">
        {isPending ? "Adding…" : "Add lead"}
      </Button>
    </form>
  );
}
