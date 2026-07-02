"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createQuote,
  type QuoteActionState,
} from "@/lib/actions/quote-actions";

export function QuoteForm({ dealId }: { dealId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<
    QuoteActionState,
    FormData
  >(createQuote, {});

  // useActionState doesn't refresh the RSC on its own; on success, force a
  // refresh so the quote shows immediately, reset the field, and toast.
  useEffect(() => {
    if (state.ok) {
      toast.success("Quote added");
      formRef.current?.reset();
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex items-end gap-2" ref={formRef}>
      <input name="dealId" type="hidden" value={dealId} />
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="quote-value">Quote value (AUD) *</Label>
        {/* Text + decimal keypad rather than type="number": a number input
            silently rejects a pasted "$12,500.00", which the server then
            normalises. */}
        <Input
          className="h-11"
          id="quote-value"
          inputMode="decimal"
          name="valueDollars"
          placeholder="e.g. 12,500"
          required
          type="text"
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
