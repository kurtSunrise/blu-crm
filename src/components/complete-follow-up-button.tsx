"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeFollowUp } from "@/lib/actions/follow-up-actions";

export function CompleteFollowUpButton({
  followUpId,
  action,
}: {
  followUpId: string;
  action: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      aria-label={`Mark done: ${action}`}
      className="min-h-11 min-w-11 shrink-0"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await completeFollowUp({ followUpId });
            if (result?.error) {
              toast.error(result.error);
              return;
            }
            router.refresh();
            toast.success("Follow-up completed");
          } catch {
            toast.error("Couldn't complete that. Please try again.");
          }
        })
      }
      size="icon"
      variant="secondary"
    >
      <Check aria-hidden className="size-5" />
    </Button>
  );
}
