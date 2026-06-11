"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
      await assignDealOwner({ dealId, ownerId });
      router.refresh();
    });
  };

  const discard = () => {
    startTransition(async () => {
      await discardLead({ dealId });
      router.refresh();
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
