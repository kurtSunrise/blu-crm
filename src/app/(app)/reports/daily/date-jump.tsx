"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import type { DateKey } from "@/lib/calendar";

// Native date input for jumping to any day. Its value/format is already the
// YYYY-MM-DD DateKey, so navigation is a direct push. Native keeps it
// mobile-friendly and dependency-free (the app ships no date-picker primitive).
export function DateJump({ dateKey }: { dateKey: DateKey }) {
  const router = useRouter();

  return (
    <label className="flex items-center" htmlFor="daily-date-jump">
      <span className="sr-only">Jump to date</span>
      <Input
        className="h-11 w-auto"
        id="daily-date-jump"
        onChange={(event) => {
          const next = event.target.value;
          if (next) {
            router.push(`/reports/daily?date=${next}`);
          }
        }}
        type="date"
        value={dateKey}
      />
    </label>
  );
}
