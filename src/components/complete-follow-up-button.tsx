"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
          await completeFollowUp({ followUpId });
          router.refresh();
        })
      }
      size="icon"
      variant="secondary"
    >
      <Check aria-hidden className="size-5" />
    </Button>
  );
}
