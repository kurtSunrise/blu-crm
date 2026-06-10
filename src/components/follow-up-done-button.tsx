"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { completeFollowUp } from "@/lib/actions/follow-up-actions";

export function FollowUpDoneButton({
  followUpId,
  label,
}: {
  followUpId: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      aria-label={`Mark done: ${label}`}
      className="min-h-11 min-w-11"
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
      <Check aria-hidden className="size-4" />
    </Button>
  );
}
