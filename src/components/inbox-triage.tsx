"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { assignDealOwner, discardLead } from "@/lib/actions/inbox-actions";

// Inbox triage (FR-3.5): assign an owner or discard, one tap each.
export function InboxTriage({
  dealId,
  dealTitle,
  users,
}: {
  dealId: string;
  dealTitle: string;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const assign = (ownerId: string) => {
    if (!ownerId) {
      return;
    }
    startTransition(async () => {
      try {
        const result = await assignDealOwner({ dealId, ownerId });
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        router.refresh();
        toast.success("Lead assigned");
      } catch {
        toast.error("Couldn't assign the lead. Please try again.");
      }
    });
  };

  const discard = () => {
    startTransition(async () => {
      try {
        const result = await discardLead({ dealId });
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        router.refresh();
        toast.success("Lead discarded");
      } catch {
        toast.error("Couldn't discard the lead. Please try again.");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <NativeSelect
        aria-label={`Assign ${dealTitle} to`}
        containerClassName="flex-1"
        defaultValue=""
        disabled={isPending}
        onChange={(event) => assign(event.target.value)}
      >
        <option disabled value="">
          Assign to…
        </option>
        {users.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </NativeSelect>
      <Button
        aria-label={`Discard ${dealTitle}`}
        className="min-h-11 min-w-11 shrink-0"
        disabled={isPending}
        onClick={discard}
        size="icon"
        variant="secondary"
      >
        <Trash2 aria-hidden className="size-5" />
      </Button>
    </div>
  );
}
