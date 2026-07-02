"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendQuote, updateQuoteStatus } from "@/lib/actions/quote-actions";

// Draft quotes can be sent; sent/viewed quotes can be marked accepted or
// declined (FR-6.1 lifecycle). Viewed is set by the public link itself.
export function QuoteRowActions({
  quoteId,
  status,
}: {
  quoteId: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (
    action: () => Promise<{ error?: string }>,
    successMessage: string
  ) => {
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        router.refresh();
        toast.success(successMessage);
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });
  };

  if (status === "draft") {
    return (
      <Button
        className="h-11"
        disabled={isPending}
        onClick={() =>
          run(() => sendQuote({ quoteId }), "Quote marked as sent")
        }
        variant="secondary"
      >
        Mark as sent
      </Button>
    );
  }

  if (status === "sent" || status === "viewed") {
    return (
      <div className="flex gap-2">
        <Button
          className="h-11"
          disabled={isPending}
          onClick={() =>
            run(
              () => updateQuoteStatus({ quoteId, status: "accepted" }),
              "Quote accepted"
            )
          }
        >
          Accepted
        </Button>
        <Button
          className="h-11"
          disabled={isPending}
          onClick={() =>
            run(
              () => updateQuoteStatus({ quoteId, status: "declined" }),
              "Quote declined"
            )
          }
          variant="secondary"
        >
          Declined
        </Button>
      </div>
    );
  }

  return null;
}
