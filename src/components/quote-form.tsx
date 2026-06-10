"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createQuote,
  type QuoteActionState,
} from "@/lib/actions/quote-actions";

export function QuoteForm({ dealId }: { dealId: string }) {
  const [state, formAction, isPending] = useActionState<
    QuoteActionState,
    FormData
  >(createQuote, {});

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input name="dealId" type="hidden" value={dealId} />
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="quote-value">Quote value (AUD) *</Label>
        <Input
          className="h-11"
          id="quote-value"
          inputMode="decimal"
          min={1}
          name="valueDollars"
          required
          step="0.01"
          type="number"
        />
      </div>
      <Button className="h-11" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Add quote"}
      </Button>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
