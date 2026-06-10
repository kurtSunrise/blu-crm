"use client";

import { Building2, Mail, NotebookPen, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { logQuickActivity } from "@/lib/actions/deal-actions";

const QUICK_LOGS = [
  { type: "call", label: "Logged a call", icon: Phone },
  { type: "site_visit", label: "Site visit done", icon: Building2 },
  { type: "email", label: "Sent an email", icon: Mail },
  { type: "meeting", label: "Meeting held", icon: NotebookPen },
] as const;

export function QuickLogButtons({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const log = (type: (typeof QUICK_LOGS)[number]["type"]) => {
    startTransition(async () => {
      await logQuickActivity({ dealId, type });
      router.refresh();
    });
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {QUICK_LOGS.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            className="h-12 justify-start gap-2"
            disabled={isPending}
            key={item.type}
            onClick={() => log(item.type)}
            variant="secondary"
          >
            <Icon aria-hidden className="size-4" />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
